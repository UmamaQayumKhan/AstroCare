"""Verify temporal causality, split integrity and reported artifact consistency."""
import io,json,tarfile,tempfile,unittest
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import mean_absolute_error
from train import read_icu,OUT,digest

class PipelineTests(unittest.TestCase):
    def test_no_future_value_enters_features(self):
        with tempfile.TemporaryDirectory() as tmp:
            files=[]
            for future in [90,190]:
                path=Path(tmp)/f'{future}.tar.gz'
                data=('Time,Parameter,Value\n00:00,RecordID,123\n00:01,HR,70\n00:02,HR,80\n00:02,HR,82\n00:03,HR,85\n00:04,HR,'+str(future)+'\n00:05,HR,-1\n').encode()
                with tarfile.open(path,'w:gz') as archive:
                    member=tarfile.TarInfo('set-a/123.txt');member.size=len(data);archive.addfile(member,io.BytesIO(data))
                frames,ids,audit=read_icu(path)
                self.assertEqual(ids,['123']);self.assertEqual(audit['negative_or_nonfinite'],1)
                self.assertEqual(frames['HR'].iloc[0].lag2,81)
                files.append(frames['HR'])
            pd.testing.assert_frame_equal(files[0].drop(columns='target'),files[1].drop(columns='target'))
            self.assertNotEqual(files[0].target.iloc[0],files[1].target.iloc[0])

    def test_real_run_artifacts(self):
        report=json.loads((OUT/'validation-report.json').read_text(encoding='utf-8'))
        splits=json.loads((OUT/'splits.json').read_text())
        self.assertFalse(report['clinical_use_enabled'])
        self.assertEqual(report['split_manifest_sha256'],digest(OUT/'splits.json'))
        self.assertEqual(len(report['models']),6)
        self.assertEqual(report['mood']['status'],'not_trained')
        # Check source codebook frequencies, including XPORT zero conversion.
        self.assertEqual(report['mood']['response_counts'],{'0':3865,'1':831,'2':224,'3':167})
        self.assertEqual(report['mood']['missing_refused_unknown'],446)
        for cohort in splits.values():
            t,v,s=(set(cohort[k]) for k in ['train','validation','test'])
            self.assertFalse(t&v or t&s or v&s)
        for m in report['models']:
            pred=pd.read_csv(OUT/f"{m['id']}-predictions.csv")
            self.assertTrue(np.isfinite(pred[['observed','prediction','baseline']].to_numpy()).all())
            self.assertAlmostEqual(mean_absolute_error(pred.observed,pred.prediction),m['test']['mae'],places=8)
            self.assertAlmostEqual(mean_absolute_error(pred.observed,pred.baseline),m['baseline_test']['mae'],places=8)
            model=joblib.load(OUT/f"{m['id']}.joblib")
            self.assertEqual(model['features'],m['features'])
            self.assertNotIn('target',model['features'])
            self.assertNotIn('horizon_minutes',model['features'])

if __name__=='__main__':unittest.main()
