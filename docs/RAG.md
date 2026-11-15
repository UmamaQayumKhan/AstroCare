# Nova evidence retrieval and optional RAG

## What is live

The public site provides on-device BM25 source search with clickable citations, readable text, optional browser read-aloud and a session-only conversation. It does not call an LLM or upload questions in local mode. The UI explicitly labels this as source search, not generative AI. Browser voice availability and speech processing depend on the installed browser/voice service.

The knowledge corpus is built with `node scripts/build-knowledge.mjs` from `science.json` and the actual `public/validation-report.json`. It includes curated NASA/CSA and measurement-source summaries, dataset usage, exact evaluation results and project limitations. It is not a full-document NASA index or a patient-record database. Each chunk carries stable IDs, source URLs, content type and a corpus checksum. Source summaries were reviewed on the recorded source-review date; future changes require review and rebuilding.

## Generative RAG implementation

The optional FastAPI development backend implements `GET /api/chat/status` and `POST /api/chat`. It retrieves the top three relevant chunks, supplies only those passages and the typed question to the OpenAI Responses API, requests structured statements with citation IDs, verifies that citations belong to the retrieved set, and falls back to local passages on errors, refusals or invalid citations. Unknown questions do not call a model. Clinical/emergency keyword boundaries bypass generation; these are precautionary heuristics, not a validated triage system. Model instructions also prohibit diagnosis and treatment. Citation-ID checks do not prove that every generated statement is entailed by its source.

No raw research rows or saved profile observations are retrieved or automatically transmitted. The interface requires choosing the AI-synthesis checkbox before sending the question and public evidence to the model provider. Requests use `store:false`; this setting does not imply zero provider retention under all service policies. Do not submit identifiable health information to this prototype.

## Activation requirements

Generation is not active on the published static site. A secure server connection and model credentials are needed. Enable the OpenAI Developers integration to configure an API key securely; do not paste a key into chat, repository files or browser settings. Set server-side `OPENAI_API_KEY`, a supported structured-output `OPENAI_MODEL`, and `ASTROCARE_RAG_ENABLED=1`. These variables are read from the process environment; `.env.example` is documentation only and is not automatically loaded. API usage may incur provider charges.

For local development, install `backend/requirements.txt`, build the knowledge corpus and run FastAPI bound to `127.0.0.1`. Set frontend `VITE_API_URL=http://127.0.0.1:8000` and use a local Vite page. Keep the allowed origin in `ASTROCARE_ORIGIN` exact. The status endpoint enables the UI checkbox only when all model settings are present. Live provider generation has not been tested without credentials; mocked provider tests validate request handling and fallback only.

Do not expose this development backend publicly. Paid generation currently rejects non-loopback requests. Production activation requires a supported server deployment with server-only secrets, authenticated users, per-user authorization and rate limits, transport security, retention controls and deployment testing. The existing static site and its public audience are preserved.

## Test and maintenance

`node --test tests/*.test.mjs` checks retrieval evidence coverage, empty/unknown inputs, safety routing and provenance. `python -m unittest discover -s backend -p test_rag.py` checks server retrieval, citations and provider-failure behavior using mocked responses; it makes no paid calls. Rebuild the corpus after every source or validation-report change, before the site build. Research model training and RAG generation are separate pipelines.
