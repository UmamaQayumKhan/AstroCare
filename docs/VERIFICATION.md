# Verification report

Verification date: 2026-11-14 UTC. These checks establish software behavior in the supplied environment, not medical or operational fitness.

## Automated checks passed

- 14 Node tests: input validation, stable observation ordering, baseline sample rules, missing/stale data, CSV formula-injection defense, evidence retrieval, abstention, citations and urgent-symptom routing.
- 10 FastAPI tests: health/chat endpoints, persistence, duplicate idempotency, conflict behavior, value/context/time/profile validation, local-origin/host controls and no-store security headers.
- 2 research-pipeline tests: artifact/schema integrity, split disjointness, expected metrics and recorded dataset hashes.
- TypeScript `tsc --noEmit` passed.
- Vite production build and service-worker asset generation passed.
- Python source compilation passed.

Raw command output is retained in `review-output/`.

## Manual browser checks passed

- Created a new fictional crew profile from the interface; it was not predefined.
- Entered a complete fictional check-in containing heart rate, blood pressure, temperature, sleep, mood, glucose and context.
- Confirmed the glucose field switched to the glucose-specific measurement guide.
- Saved the record, returned to Overview and observed the recorded values.
- Reloaded and confirmed both the user-created profile and record persisted in browser storage.
- Opened Nova and confirmed the interface identifies source search as available and generative RAG as inactive.
- Checked the dataset overview and evidence labels in the production UI.

The fictional QA entry existed only in the tester's local browser storage and is not included in source, public build or datasets.

## Research results checked

The frozen test-set results recorded by the reproducible pipeline are:

| Target | Test MAE | Unit | Meaning |
|---|---:|---|---|
| Heart rate | 4.85 | bpm | Next recorded ICU observation forecast error |
| Systolic pressure | 9.70 | mmHg | Next recorded ICU observation forecast error |
| Diastolic pressure | 7.52 | mmHg | Next recorded ICU observation forecast error |
| Temperature | 0.27 | °C | Next recorded ICU observation forecast error |
| Glucose | 32.02 | mg/dL | Next recorded ICU observation forecast error |
| Sleep duration | 1.25 | h | Cross-sectional NHANES regression error |

All selected models were frozen using validation performance before held-out testing and slightly outperformed their recorded simple baselines. These figures are not diagnostic accuracy, medical-device validation, astronaut validation, or comparison with physicians.

## Not established

- Prospective performance, sensitivity, specificity, clinical calibration or patient outcomes.
- Generalization from Earth ICU/US survey populations to healthy astronauts or microgravity.
- Accuracy of real sensors, automated data ingestion or measurement protocols in flight.
- Flight-surgeon approval, emergency treatment protocol, communication delivery or NASA certification.
- Production identity, authorization, encrypted data lifecycle, audit controls or multi-device conflict resolution.
- Offline behavior on every target browser/operating system or hardware-in-the-loop performance.

## Presentation acceptance check

Before judging, use fictional data to run the three-minute flow in `docs/SUBMISSION.md`, confirm the intended display/projector scale, and keep the local API optional. Never claim that the model diagnoses illness or performs like a doctor.

