# AstroCare — Crew Health Monitor

**NASA Space Apps Challenge 2026 · Create Health Monitoring Software for Astronauts on Space Missions**

AstroCare monitors astronaut health on long missions, where Earth may be 20 minutes away. It learns each crew member's **personal baseline**. It flags readings that are unusual **for that person**, catches **slow drifts** before any single value looks abnormal, and streams **live vitals against a model-predicted expected range**. When something goes wrong, it prepares a structured **SBAR handover** for the flight surgeon, ready before the communication link is.

> Research prototype: not a medical device and not NASA-endorsed. Use fictional data only.

## What's inside

| Area | What it does | Built on |
|---|---|---|
| **Mission control** | Whole-crew status (Nominal / Watch / Alert), latest vitals with sparklines, and a prioritised findings feed | Monitoring engine (below) |
| **Monitoring engine** | Four explainable layers: reference ranges (AHA, MedlinePlus, CDC); personal baseline (robust median ± MAD of the first 10 check-ins); Theil–Sen trend detection; symptom routing. Every flag states which rule fired and cites a source | `src/lib/monitoring.ts` |
| **Live monitor** | A simulated wearable streams HR, BP and temperature. Gradient-boosted models trained on **8,000 PhysioNet ICU stays** run **in the browser** and predict each next reading with a **split-conformal 90% expected range** (about 90% coverage on held-out test data). Inject exercise, fever, orthostatic stress or sensor dropout | `src/lib/models.ts`, `research/export_models.py` |
| **Cognitive test (PVT)** | A real psychomotor vigilance test in the browser using the PVT-B protocol (2–5 s intervals; a lapse is 355 ms or more; a false start is under 100 ms). Each result is compared with the person's own earlier tests | `src/lib/pvt.ts` |
| **Exercise countermeasures** | Session logging, 7-day compliance against a configurable weekly prescription, crew-wide compliance table | `src/lib/exercise.ts` |
| **Medical supplies** | Kit inventory with usage-based run-out projection against mission end, expiry checks, dispense log | `src/lib/inventory.ts` |
| **Flight surgeon report** | Printable / PDF report per crew member: findings, vital-sign statistics vs personal range, charts, tests, exercise, symptoms | `src/pages/Report.tsx` |
| **Daily check-in** | Guided entry with live feedback against reference and personal ranges, measurement guides, and urgent-symptom routing | NASA/CSA/MedlinePlus sources |
| **Spaceflight biomarkers** | **Real NASA OSD-575 Inspiration4** blood chemistry: 4 crew × 7 timepoints × 16 analytes, with a change-from-own-baseline heatmap | `src/lib/i4.ts` |
| **Space environment** | NASA's five hazards mapped to features, and a radiation mission planner using measured dose rates (MSL RAD, Chang'e 4) against the 600 mSv career limit | `science.json` |
| **Emergency handover** | Event clock, timestamped observation log, Earth-link delay and earliest-reply time, auto-attached vitals and findings, SBAR export and print | — |
| **Nova** | Source-citing evidence assistant (local BM25 retrieval, no paid API, abstains when unsure) | `src/rag.mjs`, `public/knowledge-base.json` |
| **Offline-first** | IndexedDB storage, a service worker, and optional sync to a local FastAPI/SQLite API | `src/storage.ts`, `backend/` |

**Interface:** React 19 + Material UI (MUI) with DataGrid. The visual language follows the high-performance HMI guideline used in control rooms (ISA-101). The interface is greyscale, and colour appears only when something needs attention: amber means watch, red means alert. It has a dark console mode (the default) and a light mode. Type is Barlow Semi Condensed with Geist and Geist Mono.

**Automation:** the app runs itself instead of waiting for manual entry.
- **Continuous telemetry:** simulated wearables stream every crew member in the background, on every page.
- **Automatic alarms:** a reading outside the model's 90% expected range, a reference-limit crossing (with escalation from watch to alert) or a sensor dropout raises an alarm. Each condition alarms once until acknowledged.
- **Automatic exercise logging:** sessions are detected from sustained heart-rate elevation, confirmed by the accelerometer activity channel, and written to the exercise record. Exertional heart rate is not alarmed.
- **Pre-filled check-in:** vitals (30-minute wearable average) and the overnight sleep estimate are filled in; crew only confirm and add mood and symptoms.
- **Daily medical brief and action queue:** generated from findings, schedules (check-in every 24 h; reaction test every 72 h, or within 24 h of a sleep finding), exercise compliance and supply projections.
- **Ground link:** contact windows and an outbox. SBAR handovers for crew on alert and the daily brief queue automatically and transmit when the next window opens, with light-time delay added.
- **First run:** the demo mission loads itself on first visit.

The demo crew is four fictional astronauts with 30 days of simulated data. Each one has a story the app must catch:
- **Commander:** healthy throughout.
- **Medical officer:** sleep eroding under isolation, with slowing reaction-test results.
- **Engineer:** fever onset; skips exercise; painkiller usage spikes in the supply projection.
- **Specialist:** blood pressure creeping up from fluid shift, with low exercise compliance.

A test verifies that all four are caught (`tests/monitoring.test.ts`).

## Run it (Windows)

Requires Node.js 20.19+ (tested on 24) and Python 3.11+.

```powershell
npm install
npm run dev          # http://127.0.0.1:5173 — click "Load demo crew"
```

Optional local sync API, in a second terminal:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## Build and deploy

```powershell
npm run build        # builds knowledge base, type-checks, bundles, writes service worker
npm run preview
```

`dist/` is a fully static, relative-path build. Upload it to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages) to get a public demo link. Without the Python API, records stay in the viewer's browser.

## Test

```powershell
npm test                                                     # 42 tests (incl. telemetry, alarms, exercise detection, brief, ground link): monitoring, PVT, exercise, supplies, demo stories, NASA parser, simulator, model parity, RAG
.\.venv\Scripts\python.exe -m pytest backend -q              # 11 API/RAG tests
.\.research-venv\Scripts\python.exe -m pytest research\test_pipeline.py -q   # 2 pipeline tests
```

Logs: `review-output/*-v2.txt`.

## Reproduce the models

```powershell
python -m venv .research-venv
.\.research-venv\Scripts\python.exe -m pip install -r research\requirements.txt
.\.research-venv\Scripts\python.exe research\train.py           # train / validate / test (PhysioNet + NHANES)
.\.research-venv\Scripts\python.exe research\export_models.py   # export trees + conformal radii to public/models/
```

`tests/models.test.mjs` checks that the browser's tree evaluation matches scikit-learn within 1e-6.

## Honest limits

- The models are trained on Earth ICU patients. The expected-range bands are calibrated on that population and need astronaut or analog recalibration.
- The sleep (R² ≈ 0) and glucose (R² 0.14) models are too weak to use. They are reported as negative results, not hidden.
- Reference ranges are Earth adult ranges; personal baselines are statistical, not clinical.
- Alerts prompt the crew medical officer. They are not diagnoses, and no treatment steps are given.
- There is no authentication, and no encryption-at-rest claim.

See `docs/SENIOR_REVIEW.md` and the in-app **Models & evidence** page.

## Data and sources

NASA OSDR OSD-575, PhysioNet/CinC 2012 (ODC-By 1.0), CDC NHANES 2017–2018, the NASA HRP hazards, risks and research pages, CSA radiation and space-science pages, AHA, MedlinePlus, CDC, and peer-reviewed dosimetry papers. The full list with links is in `science.json` and `LICENSES_AND_ATTRIBUTION.md`.
