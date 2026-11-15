"""Offline research benchmarks, NEVER a diagnosis or user-measurement estimator.

PhysioNet: next recorded value from three past values; split by ICU stay.
NHANES: cross-sectional sleep-hours regression, not a next-night forecast.
"""
import os
os.environ.setdefault('OMP_NUM_THREADS', '2')
import csv, gzip, hashlib, io, json, platform, tarfile
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import sklearn
import joblib
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT=Path(__file__).resolve().parent
DATA=ROOT/'data'
OUT=ROOT/'artifacts'
OUT.mkdir(exist_ok=True)
(ROOT.parent/'public').mkdir(exist_ok=True)
SEED=20261114
METRICS={'HR':('Heart rate','bpm'),'NISysABP':('Systolic pressure (non-invasive)','mmHg'),'NIDiasABP':('Diastolic pressure (non-invasive)','mmHg'),'Temp':('Temperature','°C'),'Glucose':('Serum glucose','mg/dL')}

def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def read_nhanes(file):
    frame=pd.read_sas(file,format='xport')
    # pandas' IBM XPORT zero conversion can yield ~5.4e-79. These files'
    # numeric measurements/codes have no such tiny nonzero values.
    for key in frame.select_dtypes(include='number'):
        frame.loc[frame[key].abs()<1e-70,key]=0.0
    return frame

def read_icu(file):
    result={key:[] for key in METRICS}
    record_ids=[]
    audit={'negative_or_nonfinite':0,'duplicate_timestamp_values_averaged':0}
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(file.read_bytes())),mode='r:') as archive:
        for member in archive:
            if not member.isfile() or not member.name.endswith('.txt'): continue
            rid=Path(member.name).stem
            if not rid.isdigit(): continue
            record_ids.append(rid)
            if len(record_ids)%1000==0: print(f'{file.name}: {len(record_ids)} stays loaded',flush=True)
            streams={k:{} for k in METRICS}
            for row in csv.DictReader(io.TextIOWrapper(archive.extractfile(member))):
                key=row['Parameter']
                if key not in METRICS: continue
                val=float(row['Value'])
                if not np.isfinite(val) or val<0:
                    audit['negative_or_nonfinite']+=1
                    continue
                hh,mm=map(int,row['Time'].split(':'))
                minute=hh*60+mm
                if minute in streams[key]: audit['duplicate_timestamp_values_averaged']+=1
                streams[key].setdefault(minute,[]).append(val)
            for key,stream in streams.items():
                seq=sorted((t,float(np.mean(v))) for t,v in stream.items())
                for i in range(2,len(seq)-1):
                    a,b,c,d=seq[i-2:i+2]
                    assert a[0]<b[0]<c[0]<d[0]
                    # No future timestamp, future value or outcome enters predictors.
                    result[key].append([rid,a[1],b[1],c[1],b[0]-a[0],c[0]-b[0],c[0],d[1],d[0]-c[0]])
    return {k:pd.DataFrame(v,columns=['id','lag3','lag2','lag1','gap2','gap1','elapsed','target','horizon_minutes']) for k,v in result.items()},record_ids,audit

def metrics(y,p,ids):
    errors=pd.DataFrame({'id':ids,'ae':np.abs(y-p)})
    per=errors.groupby('id').ae.mean().to_numpy()
    rng=np.random.default_rng(SEED)
    bootstrap=np.array([np.mean(rng.choice(per,len(per),replace=True)) for _ in range(1000)])
    return {'mae':float(mean_absolute_error(y,p)),'rmse':float(np.sqrt(mean_squared_error(y,p))),'r2':float(r2_score(y,p)),'group_mae':float(per.mean()),'group_mae_ci95':[float(v) for v in np.quantile(bootstrap,[.025,.975])]}

def fit_task(name,label,unit,frames,features,baseline,scope):
    train,val,test=frames
    assert not(set(train.id)&set(val.id) or set(train.id)&set(test.id) or set(val.id)&set(test.id))
    candidates={
        'ridge_1':make_pipeline(SimpleImputer(strategy='median',add_indicator=True),StandardScaler(),Ridge(alpha=1)),
        'ridge_100':make_pipeline(SimpleImputer(strategy='median',add_indicator=True),StandardScaler(),Ridge(alpha=100)),
        'gradient_boosting':HistGradientBoostingRegressor(max_iter=70,max_leaf_nodes=15,min_samples_leaf=40,l2_regularization=10,early_stopping=False,random_state=SEED),
    }
    scores={}
    for key,model in candidates.items():
        model.fit(train[features],train.target)
        pred=model.predict(val[features])
        scores[key]=float(pd.DataFrame({'id':val.id.to_numpy(),'error':np.abs(val.target.to_numpy()-pred)}).groupby('id').error.mean().mean())
    winner=min(scores,key=scores.get)
    model=candidates[winner] # frozen; validation not refitted; test used only after selection
    test_prediction=model.predict(test[features])
    base_val=baseline(train,val)
    base_test=baseline(train,test)
    result={'id':name,'label':label,'unit':unit,'task':scope,'features':features,'selected_model':winner,'validation_candidate_group_mae':scores,'validation':metrics(val.target.to_numpy(),model.predict(val[features]),val.id),'test':metrics(test.target.to_numpy(),test_prediction,test.id),'baseline_test':metrics(test.target.to_numpy(),base_test,test.id),'baseline_validation':metrics(val.target.to_numpy(),base_val,val.id),'counts':{n:{'groups':int(f.id.nunique()),'rows':len(f)} for n,f in zip(['train','validation','test'],frames)},'clinical_use_enabled':False}
    result['beats_baseline']=result['test']['group_mae']<result['baseline_test']['group_mae']
    if 'horizon_minutes' in test:
        result['test_horizon_minutes']={str(q):float(test.horizon_minutes.quantile(q)) for q in [.1,.5,.9]}
    joblib.dump({'model':model,'features':features,'result':result},OUT/f'{name}.joblib')
    pd.DataFrame({'group_id':test.id,'observed':test.target,'prediction':test_prediction,'baseline':base_test}).to_csv(OUT/f'{name}-predictions.csv',index=False)
    print(json.dumps({'metric':label,'model':winner,'test_mae':result['test']['mae'],'baseline_mae':result['baseline_test']['mae']}),flush=True)
    return result

def main():
    print('Reading PhysioNet set A',flush=True)
    a,aids,aa=read_icu(DATA/'set-a.tar.gz')
    print('Reading PhysioNet set B',flush=True)
    b,bids,ba=read_icu(DATA/'set-b.tar.gz')
    tr,va=train_test_split(sorted(aids),test_size=.2,random_state=SEED)
    assert len(aids)==4000 and len(bids)==4000
    assert not set(aids)&set(bids)
    splits={'physionet':{'train':tr,'validation':va,'test':sorted(bids)}}
    results=[]
    for key,(label,unit) in METRICS.items():
        frames=(a[key][a[key].id.isin(tr)],a[key][a[key].id.isin(va)],b[key])
        results.append(fit_task(key,label,unit,frames,['lag3','lag2','lag1','gap2','gap1','elapsed'],lambda train,f:f.lag1.to_numpy(),'PhysioNet ICU: predict the next recorded observation from three past observations. Variable horizon; not a daily astronaut forecast.'))
    tables={n:read_nhanes(DATA/f'{n}_J.xpt') for n in ['DEMO','BPX','SLQ','DPQ']}
    demo=tables['DEMO'][['SEQN','RIDAGEYR']]
    bp=tables['BPX'].copy()
    bp['systolic']=bp[[f'BPXSY{i}' for i in [1,2,3]]].mean(axis=1)
    bp['diastolic']=bp[[f'BPXDI{i}' for i in [1,2,3]]].mean(axis=1)
    df=demo.merge(bp[['SEQN','BPXPLS','systolic','diastolic']],on='SEQN',validate='one_to_one').merge(tables['SLQ'][['SEQN','SLD012']],on='SEQN',validate='one_to_one')
    df=df[(df.RIDAGEYR>=18)&df.SLD012.between(3,14)].rename(columns={'SEQN':'id','SLD012':'target'})
    df['id']=df.id.astype(int).astype(str)
    train,hold=train_test_split(df,test_size=.4,random_state=SEED)
    val,test=train_test_split(hold,test_size=.5,random_state=SEED)
    splits['nhanes']={n:f.id.tolist() for n,f in zip(['train','validation','test'],[train,val,test])}
    results.append(fit_task('sleep','Usual weekday sleep','h',(train,val,test),['RIDAGEYR','BPXPLS','systolic','diastolic'],lambda train,f:np.full(len(f),float(train.target.median())),'NHANES 2017–2018: cross-sectional prediction of self-reported usual weekday sleep from age, pulse and blood pressure. Not a next-night forecast; not total daily sleep.'))
    dpq=tables['DPQ'].DPQ020
    mood={'status':'not_trained','reason':'DPQ020 is frequency of feeling down/depressed/hopeless over two weeks (0–3). It is not the app’s current mood score (1–5). No conversion or diagnostic model is implemented.','source_variable':'DPQ020','response_counts':{str(int(k)):int(v) for k,v in dpq[dpq.isin([0,1,2,3])].value_counts().sort_index().items()},'missing_refused_unknown':int((~dpq.isin([0,1,2,3])).sum())}
    sources=[]
    for file in sorted(DATA.iterdir()):
        if file.suffix in ['.gz','.xpt']:
            url=('https://physionet.org/files/challenge-2012/1.0.0/'+file.name) if file.suffix=='.gz' else ('https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/'+file.name)
            sources.append({'file':file.name,'url':url,'sha256':digest(file),'bytes':file.stat().st_size})
    report={'schema_version':1,'generated_at':datetime.now(timezone.utc).isoformat(),'seed':SEED,'status':'Offline research benchmarks; not clinically validated','clinical_use_enabled':False,'environment':{'python':platform.python_version(),'numpy':np.__version__,'pandas':pd.__version__,'sklearn':sklearn.__version__},'models':results,'mood':mood,'sources':sources,'audit':{'physionet_a':aa,'physionet_b':ba},'limitations':['ICU stays are not healthy astronauts; there is no astronaut external validation.','RecordID identifies an ICU stay, not a person; distinct stays from the same individual cannot be ruled out.','Set A is split 80/20 for training/validation. Set B is a held-out source cohort, not external-hospital validation.','Only past readings predict the next observed reading; irregular measurement timing and treatments can influence results.','Only non-negative finite readings are retained; other outliers are retained. Duplicate variable/timestamp observations are averaged.','Sleep uses a 60/20/20 respondent split. Survey weights/clustering are not used: these are unweighted research benchmarks, not US population estimates.','Sleep values below 3 or above 14 are grouped codes and excluded. Predictors missing in Ridge are imputed from training only.','No diagnosis labels, emergency protocol validation, treatment recommendations, or doctor comparison were evaluated.','Mood, free-text symptoms and glucose fasting/device context do not have a validated model here.','NASA OSD-575 remains an independent reference dataset; it is not pooled with these cohorts or used for training.','Model choice uses validation only. Test errors are reported even if the trained model loses to its baseline.'], 'api':{'training':'No API key required; public file downloads.','clinical':'No medical inference API enabled. An LLM API does not establish medical accuracy.'}}
    (OUT/'splits.json').write_text(json.dumps(splits,indent=2))
    report['split_manifest_sha256']=digest(OUT/'splits.json')
    report['training_script_sha256']=digest(Path(__file__))
    for output in [OUT/'validation-report.json',ROOT.parent/'public'/'validation-report.json']:
        output.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')

if __name__=='__main__':main()
