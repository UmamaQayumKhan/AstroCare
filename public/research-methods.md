# AstroCare reproducible research benchmarks

This package trains and evaluates research regressors. It does not diagnose disease, estimate medical risk, recommend treatment, fill in a user's missing readings, or implement a medical device. The application shows the recorded evaluation only. Clinical inference is disabled.

## Data and coverage

| App field | Actual source | What was evaluated |
|---|---|---|
| Heart rate | PhysioNet/CinC 2012, HR | Next recorded value from three past readings |
| Systolic pressure | Same source, NISysABP | Same, non-invasive measurements only |
| Diastolic pressure | Same source, NIDiasABP | Same, non-invasive measurements only |
| Temperature | Same source, Temp | Same, degrees Celsius |
| Glucose | Same source, Glucose | Same, serum mg/dL; fasting status not established |
| Sleep | CDC NHANES 2017–2018, SLD012 | Cross-sectional usual weekday sleep regression |
| Mood 1–5 | No equivalent verified dataset integrated | No model. DPQ020 counts are shown separately without conversion |
| Symptoms / glucose context | User-entered context | No trained or validated interpretation |
| NASA spaceflight data | NASA OSD-575 metabolic panel | Separate source table; not training or external validation |

PhysioNet dataset: Silva I, Moody G, Mark R, Celi LA. Predicting Mortality of ICU Patients: The PhysioNet/Computing in Cardiology Challenge 2012, version 1.0.0. https://physionet.org/content/challenge-2012/1.0.0/ . This project repurposes physiological observations for regression and does NOT train the original mortality task. License: Open Data Commons Attribution License v1.0, https://opendatacommons.org/licenses/by/1-0/ . Research outputs are derived from this database; original records are not included in the package.

NHANES source: Centers for Disease Control and Prevention / National Center for Health Statistics, NHANES 2017–2018 public-use DEMO_J, BPX_J, SLQ_J and DPQ_J files. https://wwwn.cdc.gov/nchs/nhanes/continuousnhanes/default.aspx?BeginYear=2017 . Follow the NHANES data user agreement; do not attempt identification. No NASA, NIH, CDC or other endorsement is implied.

## Reproduce

Use Python 3.12 and Node with fetch support. In a fresh virtual environment:

```sh
python -m pip install -r research/requirements.txt
node research/download.mjs
python research/train.py
python research/test_pipeline.py
```

Keep the `research` folder structure. For a standalone package, create a sibling `public` folder before training. Downloading takes internet access, but no API key, account, or paid service is required. Training and evaluation run locally. Only load joblib models from trusted sources; pickle-based files can execute code.

## Evaluation protocol

The seed is 20261114. PhysioNet set A (4,000 ICU stays) is split into 3,200 training and 800 validation stays. Set B (4,000 distinct stay IDs) is held out for final testing. Record IDs identify stays, not necessarily distinct people. No reliable person-level cross-stay deduplication can be asserted. Set B is from the same source; this is NOT an external hospital or astronaut validation cohort.

For each metric, values with negative or nonfinite values are removed; other outliers remain. Multiple values of the same metric at the same time are averaged. Input is three earlier readings, their two time gaps and current elapsed ICU time. Target is the next observed value. Its future time and value are never features. This is an irregular, observation-driven horizon, not a fixed one-hour or next-day forecast. Only stays with sufficient history contribute to each metric's row counts. Treatments and observation frequency can affect results.

Ridge (alpha 1 or 100) and histogram gradient boosting are fit on training data only. Missing predictors and scaling for Ridge are learned on training only. Candidate selection minimizes mean validation MAE across stays/respondents, giving each group equal weight. The selected model remains frozen: validation is not refitted into training. Test data is evaluated afterward. A persistence baseline repeats the latest vital reading. Negative results are retained.

NHANES tables are joined only on a respondent's SEQN within the same survey cycle. Adults with exact weekday sleep values from 3 through 14 hours are included; grouped/censored values below 3 and above 14 are excluded. Features are age, pulse and mean first-three systolic/diastolic readings. Sleep/wake times and weekend sleep are excluded to avoid target reconstruction. Respondents are split 60/20/20. The baseline predicts the training median. Survey design weights and clusters are not used; results are not representative US population estimates. Household/cluster dependence may remain. This is a cross-sectional experiment, not a temporal sleep forecast.

The pandas XPORT reader can decode IBM numeric zero as approximately 5.4e-79. Numeric magnitudes below 1e-70 in these NHANES files are normalized to zero. DPQ020 response counts are checked against the CDC codebook, including 3,865 zero responses. This import correction was made during verification; models were rerun with the same fixed split and hyperparameters, without test-based model selection.

Reported metrics are observation-level MAE, RMSE, R² and group-average MAE. The 95% bootstrap interval resamples 1,000 sets of group-average absolute errors. It is uncertainty in average error, not a calibrated individual prediction interval. Candidate scores, sample counts, exact split IDs, package versions, data SHA-256 hashes and test predictions are recorded. No test-based retuning is performed.

## Why doctor-level accuracy is not established

These targets are measurements, not clinician-confirmed diagnoses. No sensitivity, specificity, clinical calibration, emergency outcomes or comparison with doctors was evaluated. Even a lower forecast error would not establish safety in spaceflight. The ICU-to-astronaut population shift is substantial. Mood, symptoms, medication, fasting status and measurement-device differences are not solved by these models.

Before any care use: define the exact clinical intended use with a flight-medicine specialist; obtain appropriate astronaut or analog cohorts and clinician-adjudicated outcomes; independently validate the frozen model and devices; assess subgroups, uncertainty and failure modes; perform prospective studies and applicable regulatory/mission review. Operational use also needs reliable offline workflows, access control, audit trails and protected storage. This package is a research starting point only.

## API requirements

No API is required for this benchmark. A future sensor integration needs the specific device/vendor interface and its measurement validation. A clinical backend needs authenticated access and appropriate data protection. A language-model API may help explain approved content but cannot certify medical accuracy and must not be used as the authority for diagnoses or emergency treatment.
