# Senior software and medical-safety review

## Review outcome

AstroCare is suitable for a hackathon demonstration as a polished, transparent research prototype. It is not suitable for real clinical or mission operations today. The application correctly avoids claiming diagnosis, treatment, NASA approval or physician-level accuracy.

## High-priority issues fixed

- Repaired the packaged backend import path so the documented `uvicorn backend.main:app` command works.
- Added strict validation for blank profile IDs, integral mood values, glucose context, timestamps and future-dated records.
- Added loopback client, host and origin controls plus `no-store` and content-type security headers for the local demonstration API.
- Added deterministic evidence retrieval, citations, abstention and urgent-symptom routing; personal readings are not interpreted as diagnoses.
- Added glucose-specific measurement/context guidance.
- Removed misleading predefined-profile language and clarified that profiles are user-created prototype records, not authentication.
- Strengthened CSV export against formula injection, including leading whitespace/control characters.
- Ensured latest observations are determined by timestamp rather than input-array order.
- Clarified emergency behavior: follow the mission-approved procedure and contact medical support; the prototype does not dispatch or transmit.
- Pinned Python dependencies and expanded frontend, backend and research tests.

## Clinical interpretation

The trained targets are measurements, not clinician-adjudicated conditions. MAE measures average numerical error and cannot establish sensitivity, specificity, calibration, emergency detection, outcome improvement or equivalence to a physician. The largest scientific limitation is population shift: PhysioNet contains critically ill Earth ICU stays, while NHANES is a US population survey; neither represents healthy crew in microgravity.

No model exists for mood, symptoms or glucose context. NASA OSD-575 is appropriately displayed as a small reference dataset only; it is not large enough for the submitted training/validation claim. The UI does not use the research models to fill missing user values, diagnose disease or recommend treatment.

## Risk register

| Risk | Current control | Required before real use |
|---|---|---|
| Incorrect medical conclusion | No diagnosis; visible limitations; source citations | Clinically defined intended use and independent prospective validation |
| Astronaut population shift | Explicitly disclosed | Astronaut/analog cohort, subgroup and microgravity validation |
| Emergency delay or false reassurance | Observation-only workflow; urgent routing | Approved mission protocols, simulation testing and flight-surgeon sign-off |
| Data confidentiality | Fictional-data warning; local storage; loopback API | Authentication, authorization, encryption, audit, retention and incident controls |
| Device error | Manual entry and context field | Validated sensor interfaces, calibration and failure detection |
| Language-model hallucination | Local retrieval is primary; citations/abstention; RAG inactive by default | Approved corpus governance, output evaluation, monitoring and human oversight |
| Dataset/license misuse | Attribution and provider links | Confirm redistribution/submission terms with event organizers |

## Remaining blockers for NASA-ready deployment

1. Define the clinical intended use with NASA flight medicine and map every action to an approved protocol.
2. Validate devices and software using astronaut or high-fidelity analog data, then freeze and independently test the complete system.
3. Add identity, role-based access, encrypted storage/transport, audit logs, backup, retention and multi-device conflict handling.
4. Integrate and verify communication with ground medical support, including delay, outage and acknowledgment behavior.
5. Run human-factors, accessibility, workload and emergency-simulation studies with representative crew.
6. Establish software lifecycle, hazard analysis, configuration control, cybersecurity assessment and applicable regulatory/mission assurance evidence.
7. Evaluate the RAG system on an approved, versioned medical corpus before enabling generation; an API key alone does not make it clinically safe.

## Honest judging claim

“AstroCare is an evidence-traceable, offline-capable health-recording and handover prototype with reproducible real-data research benchmarks. It demonstrates the workflow and technical foundation; clinical and mission validation remain future work.”

