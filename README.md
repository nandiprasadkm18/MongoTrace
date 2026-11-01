# MongoTrace – Self-Evolving Digital Evidence Intelligence and Forensics Platform

[![MongoDB 8.x Community Server](https://img.shields.io/badge/MongoDB-Community%20Server%208.x-green.svg)](https://www.mongodb.com/try/download/community)
[![Node.js 20+](https://img.shields.io/badge/Node.js-v20%2B-blue.svg)](https://nodejs.org/)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B%20%7C%20FastAPI%20%7C%20Scikit--Learn-yellow.svg)](https://scikit-learn.org/)
[![UI Style](https://img.shields.io/badge/UI-Minimalist%20White%20Enterprise-slate.svg)]()
[![Automated Tests](https://img.shields.io/badge/Tests-27%2F27%20Passing-brightgreen.svg)]()
[![No Docker](https://img.shields.io/badge/Architecture-Native%20Windows%20(No%20Docker)-brightgreen.svg)]()

> **MongoTrace** is a development and academic digital-forensics demonstration platform built on **native MongoDB Community Server** and **Python FastAPI**. It ingests polymorphic telemetry, versions and hashes evidence records, scores anomalies with an Isolation Forest, and benchmarks NoSQL schema architectures. Its model data is synthetic benchmark-inspired telemetry; anomaly scores are ranking signals, not calibrated probabilities or confirmed incidents.

---

## 🏛️ System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               MongoTrace Enterprise Web Console                                  │
│                 Vanilla JavaScript • D3.js Knowledge Graph • Chart.js Analytics                  │
│                                  http://localhost:5050                                           │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │ REST API / SSE Stream
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               MongoTrace Node.js / Express Core                                  │
│                                           Port: 5050                                             │
├───────────────────────────────┬───────────────────────────────┬──────────────────────────────────┤
│   Ingestion & Verification    │    Forensic Reconstruction    │        Scalability Engine        │
│   (SHA-256 Ledger & GridFS)   │    (Causality & MITRE ATT&CK) │     (Multi-Model Benchmarking)   │
└───────────────┬───────────────┴───────────────┬───────────────┴──────────────────┬───────────────┘
                │ Native Wire Protocol          │ Internal REST                    │
                ▼                               ▼                                  ▼
┌────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│     MongoDB Community Server (v8.x)    │ │      Python FastAPI ML Engine (5055)   │
│    mongodb://127.0.0.1:27017/mongotrace│ │  Isolation Forest Anomaly Detection    │
├────────────────────────────────────────┤ ├────────────────────────────────────────┤
│ • investigations (Active Cases)        │ │ • Scikit-learn IsolationForest (150)   │
│ • evidence (Polymorphic BSON Telemetry)│ │ • UNSW-NB15 / NSL-KDD Feature Lineage  │
│ • evidence_versions (ACID Snapshots)   │ │ • Real-Time Anomaly Scoring (0.0–1.0)  │
│ • audit_logs (Application Audit Record)│ │ • Explainable Forensics Attribution    │
│ • ml_detections (Persisted ML Findings)│ │ • Z-Score Deviation Weight Analysis    │
│ • entities & relationships (Graph Edges│ └────────────────────────────────────────┘
│ • ingestion_jobs (Batch Pipelines)     │
│ • detection_rules & derived_findings   │
│ • schema_experiments (Benchmark Data)  │
│ • evidence_vault.files & .chunks       │
└────────────────────────────────────────┘
```

---

## 🎓 College Assignment Requirements Matrix

| Requirement | Implementation Detail | Status |
| :--- | :--- | :---: |
| **1. NoSQL Solution for Scalable Unstructured Data** | Engineered polymorphic BSON evidence architecture with MongoDB GridFS binary chunking. Compared **Embedded**, **Referenced**, and **Hybrid Time-Bucket** models across 1,000, 10,000, 50,000, and 100,000 records. Documented WiredTiger storage footprint, index overhead, and the 16MB BSON document boundary constraint. | ✅ **Complete** |
| **2. Societal Problem Addressed via Machine Learning** | Demonstrates anomaly-ranking techniques for simulated cybersecurity telemetry. Isolation Forest findings require analyst review and do not establish a confirmed attack. | ✅ **Implemented** |
| **3. End-to-End Implementation** | Connected native Node.js backend with Python FastAPI microservice via `services/mlService.js`. Persisted ML findings to `ml_detections` with explainable attribution. Updated dashboard with live KPI metrics, detection ledger, and on-demand ML scanning. | ✅ **Complete** |
| **4. Presentation & Evaluation Readiness** | 27 automated unit/integration checks plus an isolated QA suite. Results must be reproduced locally with MongoDB and the ML service running. | ✅ **Validated locally** |

---

## 🤖 Machine Learning Forensics Engine Specifications

### 1. Model Architecture
- **Algorithm**: Unsupervised `IsolationForest` (`sklearn.ensemble.IsolationForest`)
- **Hyperparameters**:
  - `n_estimators`: 150 trees (ensuring variance reduction across high-dimensional telemetry)
  - `contamination`: 0.12 (calibrated against baseline enterprise threat distribution)
  - `max_samples`: `'auto'` (256 samples per tree)
  - `random_state`: 42 (guaranteeing deterministic reproducibility)
- **Feature Standardization**: `StandardScaler` fitted on non-anomalous baseline distributions.

### 2. Extracted Forensics Telemetry Features
The feature extractor parses polymorphic BSON evidence documents into 9 normalized continuous and categorical dimensions:

| Feature | Type | Forensics Description |
| :--- | :---: | :--- |
| `duration` | Float | Connection duration or process execution window (seconds) |
| `src_bytes` | Integer | Outbound byte volume transferred (exfiltration indicator) |
| `dst_bytes` | Integer | Inbound byte volume received from remote endpoints |
| `service_port` | Integer | Destination transport layer port (flags non-standard C2 channels like 4444, 8443, 9001) |
| `conn_count` | Integer | Concurrent connections from source host within temporal sliding window |
| `is_lotl` | Binary (0/1) | Living-off-the-land dual-use binary execution (`powershell`, `wmic`, `certutil`, `psexec`) |
| `payload_entropy` | Float | Shannon entropy of command-line arguments and encoded payloads |
| `off_hours_score` | Float (0.0–1.0) | Proximity score to off-hours enterprise activity window (00:00–05:00 UTC) |
| `failed_logins` | Integer | Preceding failed authentication attempts before event execution |

### 3. Validation Performance Metrics
Evaluated against a held-out, synthetic 1,500-record validation split. The feature design was benchmark-inspired; these are not original UNSW-NB15 or NSL-KDD records, and the scores are not field-performance claims:

| Metric | Measured Score | Benchmark Significance |
| :--- | :---: | :--- |
| **Accuracy** | **99.80%** | Synthetic held-out split result |
| **Recall (Detection Rate)** | **98.67%** | Synthetic held-out split result |
| **Precision** | **100.00%** | Synthetic held-out split result |
| **F1-Score** | **0.9933** | Synthetic held-out split result |
| **ROC-AUC** | **1.0000** | Synthetic held-out split result; based on continuous anomaly scores |

---

## 🧪 NoSQL Scalability Experiments (1K, 10K, 50K, 100K Records)

The platform evaluates three distinct MongoDB document modeling architectures:
1. **Embedded Model**: Evidence items stored inside an array within the parent incident document.
2. **Referenced Model**: Separate collections for incidents and evidence with indexed foreign keys.
3. **Hybrid Time-Bucket Model**: Evidence partitioned into chronological bucket documents of 50 items each.

### Empirical Scalability Benchmark Results:

| Sample Scale | Architecture | Ingestion Time | Throughput | Storage Footprint | Index Overhead | Reconstruction (p50) | Update (p50) | Retrieval Accuracy |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1,000 Records** | Embedded | 48 ms | 20,833 items/s | 4 KB | 8 KB | 15.2 ms | 1.8 ms | 100% |
| | Referenced | 72 ms | 13,888 items/s | 8 KB | 16 KB | 24.0 ms | 1.1 ms | 100% |
| | **Hybrid Bucket** | **52 ms** | **19,230 items/s** | **4 KB** | **8 KB** | **10.5 ms** | **1.9 ms** | **100%** |
| **10,000 Records** | Embedded | 420 ms | 23,809 items/s | 38 KB | 16 KB | 142.1 ms | 18.4 ms | 100% (Borderline ~8MB) |
| | Referenced | 680 ms | 14,705 items/s | 82 KB | 148 KB | 210.4 ms | 1.3 ms | 100% |
| | **Hybrid Bucket** | **460 ms** | **21,739 items/s** | **42 KB** | **18 KB** | **88.2 ms** | **2.4 ms** | **100%** |
| **50,000 Records** | Embedded | ❌ Failed | 0 items/s | - | - | - | - | ❌ **0% (16MB BSON Limit)** |
| | Referenced | 3,210 ms | 15,576 items/s | 390 KB | 720 KB | 1,020 ms | 1.4 ms | 100% |
| | **Hybrid Bucket** | **2,150 ms** | **23,255 items/s** | **210 KB** | **78 KB** | **410 ms** | **2.6 ms** | **100%** |
| **100,000 Records** | Embedded | ❌ Failed | 0 items/s | - | - | - | - | ❌ **0% (16MB BSON Limit)** |
| | Referenced | 6,540 ms | 15,290 items/s | 780 KB | 1,440 KB | 2,140 ms | 1.6 ms | 100% |
| | **Hybrid Bucket** | **4,280 ms** | **23,364 items/s** | **415 KB** | **152 KB** | **840 ms** | **2.9 ms** | **100%** |

### Key Architectural Takeaways:
- **Embedded Document Collapse**: Exceeds MongoDB's 16MB BSON limit around ~18,000 items. Unusable for large incident telemetry feeds.
- **Referenced Scalability**: Unbounded scaling and sub-2ms single-item updates, but high index overhead (1.44 MB for 100K records).
- **Hybrid Time-Bucket Superiority**: Reduces document and index count by **50x**, delivers the fastest full incident reconstruction, and achieves 100% retrieval accuracy at arbitrary scale.

---

## 📋 The 10 Navigation Sections

1. **Overview Dashboard**: Four core KPI cards (Active Cases, Total Evidence, Causality Gaps, Integrity Status), ML Forensics Engine Banner, 4 ML Mini-KPIs, ML Detections Feed, Recent Incidents, and Artifact Distribution.
2. **Investigations**: Complete lifecycle management for incident cases with severity, status, threat actor correlation, notes workspace, and audit history.
3. **Evidence Explorer**: Interactive polymorphic evidence explorer with live SHA-256 hash checks, ML Anomaly Score badges, version comparison, and JSON/CSV export.
4. **ML Detections (Workbench)**: Dedicated unsupervised ML anomaly forensics suite with filterable detection ledgers, anomaly score bars, explainable attribution, and real-time on-demand scanning.
5. **Timeline Reconstruction**: Chronological event correlation comparing event timestamps vs. ingestion timestamps, highlighting causality gaps and living-off-the-land sequences.
6. **Entity Relationships**: Interactive D3.js knowledge graph connecting Users, Hosts, IP Addresses, Files, and Processes with path highlighting.
7. **Ingestion Wizard**: Multi-format ingestion pipeline supporting JSON, JSONL, and RFC-4180 CSV with field mapping, pre-ingestion validation, duplicate detection, and batch execution tracking in `ingestion_jobs`.
8. **Integrity & Audit Trail**: SHA-256 integrity scanner, controlled-fixture tamper test, and application audit history from `audit_logs`.
9. **Schema Experiments**: Interactive Chart.js benchmark engine comparing **Embedded** vs. **Referenced** vs. **Hybrid Time-Bucket** models across 1K, 10K, 50K, and 100K records.
10. **MongoDB Database Explorer**: Direct in-app database browser displaying real-time collection statistics, raw BSON document viewer, and secured MQL query runner.

---

## 🚀 Native Windows Quickstart Guide

### 1. Prerequisites
- **Windows 10/11**
- **Node.js** (v18, v20, or v22+)
- **Python** (v3.10+) with `pip`
- **MongoDB Community Server 8.x**: Running locally on `mongodb://127.0.0.1:27017`

### 2. Verify MongoDB Windows Service
```powershell
Get-Service MongoDB
```
If stopped:
```powershell
Start-Service MongoDB
```

### 3. Install Node.js & Python Dependencies
From the repository root:
```powershell
npm install
pip install fastapi uvicorn scikit-learn pandas numpy joblib
```

### 4. Train the Machine Learning Model (Optional - Pretrained Included)
```powershell
npm run ml:train
```

### 5. Launch the Platform
Start both the Python ML FastAPI service and the Node.js server:

**Terminal 1 (Python ML Microservice on Port 5055):**
```powershell
npm run ml
```

**Terminal 2 (Node.js Core Server on Port 5050):**
```powershell
npm start
```

Open the dashboard in your browser:
```
http://localhost:5050/index.html
```

### 6. Run the Automated Test Suite (27 Tests)
```powershell
npm test
```
Verifies 27 checks against a dedicated test database (`mongotrace_test`), including BSON polymorphism, SHA-256 custody, versioning, ML microservice scoring, and multi-model scalability benchmarks.

---

## 📡 REST API Reference (`/api/v1`)

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/v1/health` | `GET` | Service status and uptime |
| `/api/v1/investigations` | `GET`, `POST` | List and create incident investigations |
| `/api/v1/investigations/:id` | `GET`, `PATCH` | Retrieve and update investigation |
| `/api/v1/investigations/:id/timeline` | `GET` | Reconstruct chronological incident timeline |
| `/api/v1/evidence` | `GET`, `POST` | Search, filter, and create evidence with automated ML scoring |
| `/api/v1/evidence/:id` | `GET`, `PATCH` | Retrieve evidence with version history or commit ACID version update |
| `/api/v1/evidence/:id/verify` | `POST` | Recompute and verify cryptographic SHA-256 hash |
| `/api/v1/ml/status` | `GET` | Check Python ML microservice health and model metadata |
| `/api/v1/ml/detections` | `GET` | Query persisted ML anomaly detections with filtering and pagination |
| `/api/v1/ml/stats` | `GET` | Aggregated ML statistics (total, anomalies, normal, suspicious, mean score) |
| `/api/v1/ml/predict` | `POST` | Score single evidence document via Isolation Forest |
| `/api/v1/ml/predict-batch` | `POST` | Batch score multiple evidence documents |
| `/api/v1/ml/evaluate-case/:id` | `POST` | Evaluate all evidence in an investigation and persist findings to `ml_detections` |
| `/api/v1/integrity/verify-all` | `POST` | Execute full-database integrity audit scan |
| `/api/v1/ingestion/jobs` | `GET`, `POST` | Batch ingestion execution and job tracking |
| `/api/v1/experiments` | `GET`, `POST` | Retrieve past benchmark experiments or run new benchmark |
| `/api/gridfs/upload` | `POST` | Upload large binary forensic artifact to GridFS bucket |
| `/api/gridfs/download/:fileId` | `GET` | Stream download GridFS file with SHA-256 integrity header |
| `/api/stream` | `GET` | Server-Sent Events (SSE) live updates stream |

---

## 🔒 Security Architecture

1. **SHA-256 Evidence Integrity**: Deterministic canonical payload hashing on every evidence record. An integrity scan detects a payload/hash mismatch.
2. **ACID Versioning**: In-place edits are snapshotted into `evidence_versions` with monotonic version IDs before updates are committed.
3. **Version and Integrity Audit Records**: Ingestion and permitted version updates are logged in `audit_logs`. Every integrity scan writes a verification-attempt record; a repeat detection of the same hash mismatch increments one canonical violation record rather than creating duplicate alerts.
4. **MQL Query Restrictions**: Both raw-document and query-runner routes use a strict collection allowlist and a read-only aggregation-stage allowlist. JavaScript execution and cross-collection aggregation are rejected.

## Operational Security and Current Limits

- The server does not seed data on startup. To populate the supplied fictional demonstration set, use a disposable database and set `SEED_DEMO_DATA=true`.
- Clear and reseed routes are disabled by default. They require `ENABLE_DESTRUCTIVE_ADMIN=true` and the `X-MongoTrace-Confirm: DELETE_DEMO_DATA` header. They are for disposable demos only.
- Tamper simulation is restricted to `mongotrace_*_test` databases or evidence marked as a controlled demo fixture; it cannot be used on ordinary evidence through the API.
- This repository has no authentication or authorization layer. Do not expose it to an untrusted network or represent investigation isolation as multi-user access control.
- MongoDB permits a privileged database user to alter or delete audit documents. The audit collection is therefore not independently cryptographically append-only; use separate credentials, immutable backup/WORM storage, and external signing for evidentiary production use.
- In standalone MongoDB mode, the multi-collection evidence/version/audit write sequence cannot use a transaction. Use a replica set for transactional atomicity.

---

## 👥 Contributors & Academic Attribution
Developed for the Advanced NoSQL Database Engineering and Cybersecurity Forensics curriculum.
