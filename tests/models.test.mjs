import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const bundle = load('../public/models/vitals-models.json');
const fixtures = load('./fixtures/model-parity.json');

// Node: [value, featureIdx, threshold, missingGoLeft, left, right, isLeaf]
function predict(model, x) {
  let sum = model.baseline;
  for (const tree of model.trees) {
    let i = 0;
    for (;;) {
      const [value, f, threshold, missingGoLeft, left, right, isLeaf] = tree[i];
      if (isLeaf) { sum += value; break; }
      const v = x[f] === null || x[f] === undefined ? NaN : x[f];
      i = (Number.isNaN(v) ? missingGoLeft === 1 : v <= threshold) ? left : right;
    }
  }
  return sum;
}

test('bundle has the expected shape', () => {
  assert.equal(bundle.version, 1);
  assert.deepEqual(Object.keys(bundle.models).sort(), ['HR', 'NIDiasABP', 'NISysABP', 'Temp']);
  const {gapMinutes, elapsedMinutes} = bundle.trainingDomain;
  assert.ok(gapMinutes[0] < gapMinutes[1] && elapsedMinutes[0] < elapsedMinutes[1]);
  for (const model of Object.values(bundle.models)) {
    assert.deepEqual(model.features, ['lag3', 'lag2', 'lag1', 'gap2', 'gap1', 'elapsed']);
    assert.ok(model.trees.length > 0 && model.trees.every((t) => t.every((n) => n.length === 7)));
  }
});

for (const [id, rows] of Object.entries(fixtures)) {
  test(`${id}: JS tree evaluation matches sklearn within 1e-6`, () => {
    const model = bundle.models[id];
    assert.ok(model, `missing model ${id}`);
    assert.ok(rows.length >= 40);
    for (const {x, y} of rows) {
      const js = predict(model, x);
      assert.ok(Math.abs(js - y) < 1e-6, `${id} x=${JSON.stringify(x)} js=${js} sklearn=${y}`);
    }
  });
}

test('conformal radii are ordered and empirically calibrated on the test set', () => {
  const nominal = {q80: 0.8, q90: 0.9, q95: 0.95};
  for (const [id, {conformal}] of Object.entries(bundle.models)) {
    assert.ok(conformal.q80 > 0 && conformal.q80 < conformal.q90 && conformal.q90 < conformal.q95, id);
    assert.ok(conformal.nCalibration > 0, id);
    for (const [key, level] of Object.entries(nominal)) {
      assert.ok(Math.abs(conformal.testCoverage[key] - level) <= 0.05, `${id} ${key} coverage ${conformal.testCoverage[key]}`);
    }
  }
});
