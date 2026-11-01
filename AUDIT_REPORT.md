# MongoTrace technical audit and validation report

**Audit date:** 2026-11-01 (Asia/Kolkata)  
**Classification:** Functionally validated academic project — not production-ready.

## 1. Project audit summary

The repository is a Node.js/Express + native MongoDB + Vanilla JavaScript application with a Python/FastAPI Isolation Forest service. The working tree already contained a large, uncommitted implementation pass before this audit; it was preserved. This audit validated the execution paths, repaired verified contract, integrity, safety, startup, and documentation defects, and ran isolated tests against MongoDB 8.2.0.

Architecture: browser UI → Express API/SSE → MongoDB collections/GridFS; Express calls FastAPI for scoring and persists results to `ml_detections`. Ingestion uses parse → validation/deduplication → evidence/version/audit/entity persistence → ML/detection processing. Timeline and graph services read persisted evidence and explicit relations. Schema benchmarks use dedicated `schema_bench_*` collections.

## 2. Issues discovered

| Severity | Root cause | Result |
|---|---|---|
| P0 | `/api/admin/clear` and `/api/cases/reseed` deleted data without a runtime safety gate. | Fixed. |
| P0 | Tamper simulation modified any selected evidence record. | Fixed: controlled fixtures/isolated test namespaces only. |
| P1 | Ingestion completion UI read `job.accepted`/`job.rejected`; API returns `acceptedCount`/`rejectedCount`. | Fixed. |
| P1 | Job accounting omitted validation-stage rejects and duplicates from final job counts. | Fixed. |
| P1 | Server seeded fictional data automatically at startup. | Fixed: opt-in only. |
| P1 | Raw database document route bypassed collection allowlisting and `$where` safety checks. | Fixed. |
| P2 | Evidence version update accepted mass-assignment of identifiers, hashes, integrity state, and arbitrary root fields. | Fixed with a mutable-field allowlist. |
| P2 | CSV parsing split physical lines and did not reject unterminated quoted fields. | Fixed with stream-style RFC-4180 parsing. |
| P2 | Cross-investigation evidence relations were not verified against both underlying evidence records. | Fixed. |
| P3 | No close lifecycle for the MongoDB client. | Fixed with graceful SIGINT/SIGTERM shutdown. |
| P4 | README overstated dataset provenance, audit immutability, production posture, and test count. | Corrected. |

## 3. Issues fixed

- Ingestion responses and UI now use one actual contract: `acceptedCount`, `rejectedCount`, `totalRecords`, `durationMs`, and warning status. Validation rejects and duplicates are included in persisted job accounting.
- Document inspection and MQL routes are bounded, collection-allowlisted, and reject JavaScript execution and unapproved aggregation stages.
- Destructive reset routes require `ENABLE_DESTRUCTIVE_ADMIN=true` plus `X-MongoTrace-Confirm: DELETE_DEMO_DATA`.
- Evidence versioning permits only validated descriptive/evidentiary fields; identifiers and integrity metadata are immutable through this service.
- Controlled tamper simulation is isolated from ordinary evidence; the supplied demo fixture is explicitly marked.
- The application no longer inserts demonstration data on an ordinary startup. `SEED_DEMO_DATA=true` is required for a disposable demonstration database.

## 4. Files modified during this audit

- `.env.example` — documented CORS, bounded body size, demo seeding, and destructive-admin controls.
- `server.js` — CORS/body bounds, ingestion accounting, inspector safety, reset gates, opt-in seed, and graceful shutdown.
- `services/db.js` — database close lifecycle.
- `services/ingestionService.js` — robust CSV parser, record/severity validation, and full ingestion job accounting.
- `services/evidenceService.js` — safe evidence update allowlist, date validation, relationship scope validation, controlled tampering.
- `public/app.js` — corrected ingestion count contract and explicit reset-confirm header.
- `data/seedScenarios.js` — marked only the demo tamper fixture as controlled.
- `README.md` — accurate data/model/security/operational claims.

## 5. Backend validation

- Syntax: `node --check` passed for server and changed services; Python compile check passed.
- API smoke test: investigation creation and a three-record ingestion produced `1 accepted`, `2 rejected`, `3 total`, and `COMPLETED_WITH_WARNINGS`.
- API security smoke checks: forbidden collection, `$where`, non-fixture tamper, and default destructive reset each returned HTTP 403.
- Shutdown behavior was implemented; no application server or ML API process was left running after validation.

## 6. MongoDB validation

The existing index setup covers investigation/case lookup, evidence identifiers, scoped time lookup, artifact/severity, entities, ingestion jobs, audit logs, relationships, GridFS, ML detections, and benchmark collections. Tests exercised CRUD, evidence versioning, entity persistence, relations, collection query restrictions, and isolated database cleanup.

## 7. Ingestion validation

JSON, JSONL, CSV quoted commas, duplicate handling, malformed values, mapping, concurrent batches, persistence, and job history passed in the automated suite. The API smoke fixture confirmed no `undefined` count contract remains. GridFS paths are covered by the existing integration logic but no large real-world binary upload was performed in this audit.

## 8. Machine-learning validation

`python -m ml.test_ml_pipeline` passed 6/6. The full Node suite validated health, model metadata, scoring, attribution, persistence, statistics, batch evaluation, and heuristic degradation while the ML API is unavailable. Dataset documentation and README now identify validation data as synthetic benchmark-inspired telemetry. Reported scores are not calibrated probabilities or real-world performance claims.

## 9. Digital-forensics validation

Evidence hash verification, versions, custody records, audit records, and controlled tamper detection passed in both test suites. The protection detects payload/hash mismatch. MongoDB alone does not make audit records cryptographically append-only; privileged database access can alter them, so production evidentiary use requires external signing and immutable backup/WORM storage.

## 10. Timeline and entity validation

The isolated QA suite passed chronological reconstruction, investigation filtering, ID harmonization, entity extraction, relation graph node/edge construction, and report/export serialization. Relation writes now reject missing, self-referential, and cross-investigation evidence pairs.

## 11. Benchmark results

Results below are from the isolated QA run on local MongoDB 8.2.0 and should not be treated as production capacity claims.

| Records | Duration | Embedded retrieval | Referenced retrieval | Hybrid retrieval | Referenced p50 reconstruction | Hybrid p50 reconstruction |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 456.9 ms | 100% | 100% | 100% | 19.00 ms | 13.00 ms |
| 10,000 | 5,374.2 ms | 100% | 100% | 100% | 309.26 ms | 271.69 ms |
| 50,000 | 12,770.7 ms | 0% (16 MB limit) | 100% | 100% | 1,856.70 ms | 1,552.08 ms |
| 100,000 | 28,015.0 ms | 0% (16 MB limit) | 100% | 100% | 3,932.40 ms | 3,523.52 ms |

The small residual embedded collection size at 50K/100K is an empty/failed-attempt artifact, not usable embedded storage. The benchmark accurately reports the 16 MB boundary rather than fabricating a successful embedded result.

## 12. Security audit

Fixed: arbitrary collection access through the document inspector, `$where` execution route, permissive aggregation stages, unrestricted destructive admin routes, ordinary-evidence tampering, mass assignment on evidence versioning, automatic demo writes, and default wildcard CORS.

Remaining: no authentication or authorization exists. The app must remain on a trusted network and should not be called multi-user secure. Configure `CORS_ORIGIN`; use dedicated least-privilege MongoDB accounts and a replica set for transactional evidence writes.

## 13. Frontend validation

The ingestion completion-count mismatch was repaired at its source and client use. Existing UI code, graph code, and styles were preserved. Automated API/service validation was completed; manual cross-browser responsive/visual testing was not performed in this audit.

## 14. Test results

- `python -m ml.test_ml_pipeline`: **6 passed, 0 failed**.
- `npm test`: **27 passed, 0 failed**; uses and drops `mongotrace_test`.
- `node tests/e2e_qa_validation.js`: **11 passed, 0 failed**; uses and drops `mongotrace_qa_val`.
- Static JavaScript and Python compilation checks: passed.

## 15. Performance and scalability

The 1K–100K benchmark above executed locally. Hybrid and referenced models retrieved all records at tested scales; embedded correctly stopped at the BSON limit. No load, memory-profile, multi-user, WAN, or production deployment benchmark was performed.

## 16. Remaining issues and required follow-up

1. Add authentication, authorization, user-to-investigation access control, and CSRF/rate-limit policy before any network deployment.
2. Use a MongoDB replica set, transaction monitoring, backup/restore testing, and least-privilege credentials.
3. Externalize audit-chain signatures and retain immutable evidence/audit copies outside the application database.
4. Validate GridFS integrity after streamed download and add large-file/recovery tests.
5. Perform manual UI/browser/accessibility testing and a controlled end-to-end demonstration in a disposable database.
6. Validate ML behavior against representative, independently collected telemetry before operational use.

## 17. Final assessment

| Dimension | Assessment |
|---|---|
| Functionality | Core workflows validated in isolated tests. |
| Architecture | Sound educational modular architecture; needs auth and deployment hardening. |
| Database design | Indexed, scoped, and benchmarked; standalone mode limits atomic multi-document writes. |
| Digital forensics | Hash verification/versioning work, but evidentiary immutability is incomplete. |
| Machine learning | Integrated and explainable; synthetic validation only. |
| Security | Important API hazards fixed; no identity/access layer. |
| Scalability | Bounded evidence from local 100K benchmark only. |
| Reliability | Isolated tests pass; operational monitoring and recovery remain limited. |

MongoTrace is suitable as a **functionally validated academic project**, not a production-ready or enterprise-grade forensic system.
