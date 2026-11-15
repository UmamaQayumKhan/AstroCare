"""Export the four PhysioNet HistGradientBoosting forecasters for in-browser use.

Reads (never modifies) research/artifacts/{HR,NISysABP,NIDiasABP,Temp}.joblib,
splits.json, *-predictions.csv and research/data/set-a.tar.gz. Writes:
  public/models/vitals-models.json   tree dump + split-conformal radii
  tests/fixtures/model-parity.json   sklearn predictions for JS parity tests

Prediction rule encoded in the JSON (per tree, start at node 0):
  node = [value, featureIdx, threshold, missingGoLeft, left, right, isLeaf]
  if isLeaf: return value
  if x[featureIdx] is NaN: go left iff missingGoLeft
  else: go left iff x[featureIdx] <= threshold
prediction = baseline + sum(leaf value over trees)

Run: python research/export_models.py   (uses scikit-learn 1.6.1 to unpickle)
"""
import json, math, sys
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
import sklearn

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from train import read_icu, METRICS, DATA, OUT, SEED  # noqa: E402

PROJECT = ROOT.parent
MODEL_OUT = PROJECT / 'public' / 'models' / 'vitals-models.json'
FIXTURE_OUT = PROJECT / 'tests' / 'fixtures' / 'model-parity.json'
IDS = ['HR', 'NISysABP', 'NIDiasABP', 'Temp']
FEATURES = ['lag3', 'lag2', 'lag1', 'gap2', 'gap1', 'elapsed']
ALPHAS = {'q80': 0.2, 'q90': 0.1, 'q95': 0.05}
LEAF_SIG = 12  # leaf values: 12 significant digits keeps parity << 1e-6
N_FIXTURE = 40


def sig(x, digits):
    x = float(x)
    if x == 0 or not math.isfinite(x):
        return 0.0 if x == 0 else x
    return float(f'{x:.{digits}g}')


def export_trees(model):
    assert type(model).__name__ == 'HistGradientBoostingRegressor', type(model)
    assert model.n_trees_per_iteration_ == 1
    assert model.is_categorical_ is None, 'categorical features are not supported by the export'
    assert getattr(model, '_preprocessor', None) is None
    assert model.loss == 'squared_error', model.loss  # identity link
    assert list(model.feature_names_in_) == FEATURES
    baseline = np.asarray(model._baseline_prediction).ravel()
    assert baseline.size == 1
    trees = []
    for iteration in model._predictors:
        assert len(iteration) == 1
        nodes = iteration[0].nodes
        names = nodes.dtype.names
        for field in ['value', 'feature_idx', 'num_threshold', 'missing_go_to_left', 'left', 'right', 'is_leaf']:
            assert field in names, (field, names)
        if 'is_categorical' in names:
            assert not nodes['is_categorical'].any(), 'categorical split found'
        tree = []
        for n in nodes:
            if n['is_leaf']:
                tree.append([sig(n['value'], LEAF_SIG), 0, 0, 0, 0, 0, 1])
            else:
                tree.append([0, int(n['feature_idx']), float(n['num_threshold']),
                             int(bool(n['missing_go_to_left'])), int(n['left']), int(n['right']), 0])
        trees.append(tree)
    return float(baseline[0]), trees


def js_predict(baseline, trees, X):
    out = np.full(len(X), baseline, dtype=float)
    for tree in trees:
        for r, x in enumerate(X):
            i = 0
            while True:
                v, f, t, ml, left, right, leaf = tree[i]
                if leaf:
                    out[r] += v
                    break
                xv = x[f]
                i = left if ((ml == 1) if math.isnan(xv) else xv <= t) else right
    return out


def conformal_q(residuals, alpha):
    r = np.sort(np.asarray(residuals, dtype=float))
    n = len(r)
    k = math.ceil((n + 1) * (1 - alpha))
    assert 1 <= k <= n, (k, n)
    return float(r[k - 1])


def main():
    splits = json.loads((OUT / 'splits.json').read_text())['physionet']
    train_ids, val_ids = set(splits['train']), set(splits['validation'])
    print('Reading PhysioNet set A', flush=True)
    frames, _, _ = read_icu(DATA / 'set-a.tar.gz')

    def domain(rows):
        return {'gapMinutes': [float(v) for v in np.percentile(rows.gap1, [1, 99])],
                'elapsedMinutes': [float(v) for v in np.percentile(rows.elapsed, [1, 99])]}

    pooled_train = pd.concat([frames[k][frames[k].id.isin(train_ids)] for k in IDS])
    models, fixtures = {}, {}
    rng = np.random.default_rng(SEED)
    for key in IDS:
        bundle = joblib.load(OUT / f'{key}.joblib')
        model, result = bundle['model'], bundle['result']
        assert bundle['features'] == FEATURES
        baseline, trees = export_trees(model)

        val = frames[key][frames[key].id.isin(val_ids)]
        assert len(val) == result['counts']['validation']['rows'], (len(val), result['counts'])
        Xv = val[FEATURES].to_numpy(dtype=float)
        pv = model.predict(val[FEATURES])
        # Sanity: matches the validation MAE stored at training time.
        assert abs(np.mean(np.abs(val.target.to_numpy() - pv)) - result['validation']['mae']) < 1e-9

        # Parity of the exported tree dump against sklearn on every validation row.
        jp = js_predict(baseline, trees, Xv)
        max_err = float(np.max(np.abs(jp - pv)))
        assert max_err < 1e-8, (key, max_err)

        residuals = np.abs(val.target.to_numpy() - pv)
        qs = {name: sig(conformal_q(residuals, a), 6) for name, a in ALPHAS.items()}  # coverage uses the exported (rounded) radii
        test = pd.read_csv(OUT / f'{key}-predictions.csv')
        test_res = np.abs(test.observed.to_numpy() - test.prediction.to_numpy())
        coverage = {name: round(float(np.mean(test_res <= q)), 4) for name, q in qs.items()}

        label, unit = METRICS[key]
        models[key] = {
            'label': label, 'unit': unit, 'features': FEATURES, 'baseline': baseline, 'trees': trees,
            'conformal': {
                'calibration': f'PhysioNet set A validation stays (n={len(val)} rows, {val.id.nunique()} stays)',
                **qs,
                'testCoverage': coverage, 'nCalibration': int(len(val)),
            },
            'testMae': sig(result['test']['mae'], 6),
            'baselineMae': sig(result['baseline_test']['mae'], 6),
            'trainingDomain': domain(frames[key][frames[key].id.isin(train_ids)]),
        }
        print(json.dumps({'model': key, 'trees': len(trees), 'nodes': sum(map(len, trees)),
                          'max_parity_err': max_err, **qs, 'coverage': coverage}), flush=True)

        idx = np.sort(rng.choice(len(val), size=min(N_FIXTURE, len(val)), replace=False))
        nan_rows = np.flatnonzero(np.isnan(Xv).any(axis=1))
        if len(nan_rows):
            idx = np.unique(np.concatenate([idx[:N_FIXTURE - 5], nan_rows[:5]]))
        fixtures[key] = [{'x': [None if math.isnan(v) else float(v) for v in Xv[i]], 'y': float(pv[i])} for i in idx]

    doc = {
        'version': 1,
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'source': f'research/artifacts/*.joblib (sklearn {sklearn.__version__})',
        'trainingDomain': domain(pooled_train),
        'models': models,
    }
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_OUT.parent.mkdir(parents=True, exist_ok=True)
    MODEL_OUT.write_text(json.dumps(doc, separators=(',', ':'), ensure_ascii=False, allow_nan=False), encoding='utf-8')
    FIXTURE_OUT.write_text(json.dumps(fixtures, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'wrote {MODEL_OUT} ({MODEL_OUT.stat().st_size} bytes)')
    print(f'wrote {FIXTURE_OUT} ({FIXTURE_OUT.stat().st_size} bytes)')
    print('trainingDomain', json.dumps(doc['trainingDomain']))


if __name__ == '__main__':
    assert sklearn.__version__ == '1.6.1', f'need scikit-learn 1.6.1 to unpickle, have {sklearn.__version__}'
    main()
