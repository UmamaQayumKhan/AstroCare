# Package contents

| Path | Purpose |
|---|---|
| `src/`, `public/`, `index.html` | React application (pages in `src/pages`, logic in `src/lib`) and offline assets |
| `public/models/vitals-models.json` | Browser-exported PhysioNet models + conformal radii |
| `research/export_models.py` | Exports trained trees and calibrates conformal intervals |
| `backend/` | Local FastAPI/SQLite API and source-grounded optional RAG |
| `research/data/` | Downloaded public research inputs used by the pipeline |
| `research/artifacts/` | Frozen models, split IDs, predictions and validation report |
| `research/train.py` | Reproducible training/validation/test pipeline |
| `research/test_pipeline.py` | Artifact and split integrity tests |
| `tests/` | Monitoring, demo-story, NASA parser, simulator, model-parity and retrieval tests |
| `dist/` | Ready production static build |
| `science.json` | Evidence/source mapping and scope boundaries |
| `docs/` | Submission, verification and senior review |
| `review-output/` | Recorded test/build logs |
| `CHECKSUMS_SHA256.txt` | SHA-256 integrity manifest for packaged files |

Excluded: dependency folders, virtual environments, caches, Git history, local databases, secrets and deployment-provider metadata.

