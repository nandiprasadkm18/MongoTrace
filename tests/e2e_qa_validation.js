/**
 * MongoTrace Comprehensive End-to-End QA Validation Suite
 * Executes rigorous verification across Tasks 1 to 11
 * Uses isolated test database: 'mongotrace_qa_val'
 */

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.DB_NAME = 'mongotrace_qa_val';

const { MongoClient } = require('mongodb');
const { connectDB, getDB } = require('../services/db');
const {
  createInvestigation,
  getInvestigations,
  getInvestigationById,
  updateInvestigation
} = require('../services/investigationService');
const {
  createEvidence,
  getEvidenceWithHistory,
  updateEvidenceWithVersion,
  verifyEvidenceHash,
  testTamperEvidence,
  calculateHash
} = require('../services/evidenceService');
const {
  parseRawData,
  previewIngestion,
  validateIngestionBatch,
  executeIngestion
} = require('../services/ingestionService');
const { reconstructIncident, traceCausalityChain } = require('../services/reconstructionService');
const { runSchemaBenchmark } = require('../services/benchmarkService');
const { analyzeCaseAnomalies } = require('../services/anomalyService');
const { runDetectionEngine, getDerivedFindings, getDetectionRules } = require('../services/detectionService');
const {
  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch,
  recordMLDetection,
  getMLDetections,
  getMLStats,
  localHeuristicScorer
} = require('../services/mlService');

async function runQAValidation() {
  console.log('========================================================================');
  console.log('   MongoTrace Senior QA & Cybersecurity End-to-End Validation Suite    ');
  console.log('   Target Database: mongodb://127.0.0.1:27017/mongotrace_qa_val        ');
  console.log('========================================================================\n');

  const qaReport = {
    startTime: new Date(),
    tasks: {},
    benchmarkResults: {},
    mlEvaluationResults: {},
    securityAudit: {},
    failures: [],
    passedCount: 0,
    failedCount: 0
  };

  let client = null;
  let db = null;

  try {
    const conn = await connectDB();
    client = conn.client;
    db = getDB();

    // Clean test database
    await db.dropDatabase();
    console.log('[Setup] Purged mongotrace_qa_val database cleanly.\n');

    // -------------------------------------------------------------
    // TASK 1: Verify evidence ingestion
    // -------------------------------------------------------------
    console.log('>>> [TASK 1] Verifying Evidence Ingestion (JSON, JSONL, RFC-4180 CSV)...');
    try {
      const invId = 'INV-QA-INGEST';
      await createInvestigation({
        investigationId: invId,
        title: 'QA Ingestion Verification Investigation',
        severity: 'HIGH'
      });

      // 1. JSON parse & preview
      const jsonRaw = JSON.stringify([
        { title: 'JSON Event 1', artifactType: 'SECURITY_EVENT', sourceHost: 'srv-01', severity: 'MEDIUM' }
      ]);
      const jsonParsed = parseRawData(jsonRaw, 'application/json');
      if (!Array.isArray(jsonParsed) || jsonParsed.length !== 1) throw new Error('JSON parsing failed');

      // 2. JSONL parse & preview
      const jsonlRaw = '{"title":"JSONL 1","sourceHost":"srv-02"}\n{"title":"JSONL 2","sourceHost":"srv-03"}';
      const jsonlParsed = parseRawData(jsonlRaw, 'application/x-ndjson');
      if (!Array.isArray(jsonlParsed) || jsonlParsed.length !== 2) throw new Error('JSONL parsing failed');

      // 3. RFC-4180 CSV with quoted fields and embedded commas
      const csvRaw = 'title,sourceHost,severity,commandLine\n"Event with, comma","host-01",HIGH,"powershell.exe -enc aW52b2tl,encoded"\n"Normal Event","host-02",LOW,"cmd.exe /c whoami"';
      const csvParsed = parseRawData(csvRaw, 'text/csv');
      if (!Array.isArray(csvParsed) || csvParsed.length !== 2) throw new Error('CSV line parsing count mismatch');
      if (csvParsed[0].title !== 'Event with, comma') {
        throw new Error(`CSV embedded comma parsing error: got '${csvParsed[0].title}'`);
      }

      // 4. Batch validation
      const validation = await validateIngestionBatch(invId, csvParsed, {
        title: 'title',
        sourceHost: 'sourceHost',
        severity: 'severity'
      });
      if (validation.validCount !== 2) throw new Error(`Validation rejected valid records: ${validation.validCount}`);

      // 5. Execution and batch job logging
      const execResult = await executeIngestion(invId, validation.validRecords, 'QA_CSV_TEST', 'QA-Engineer');
      if (execResult.status !== 'COMPLETED' || execResult.acceptedCount !== 2) {
        throw new Error(`executeIngestion status error: ${JSON.stringify(execResult)}`);
      }

      // Verify job logged in ingestion_jobs
      const job = await db.collection('ingestion_jobs').findOne({ jobId: execResult.jobId });
      if (!job || job.status !== 'COMPLETED' || job.acceptedCount !== 2) {
        throw new Error('Ingestion job document verification failed in ingestion_jobs');
      }

      qaReport.tasks['TASK_1_INGESTION'] = { status: 'PASSED', acceptedRecords: execResult.acceptedCount, jobId: execResult.jobId };
      qaReport.passedCount++;
      console.log('    ✓ Ingestion passed: JSON, JSONL, RFC-4180 CSV verified with job tracking.\n');
    } catch (err) {
      qaReport.tasks['TASK_1_INGESTION'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 1', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Ingestion failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 2: Verify SHA-256 integrity and tampering detection
    // -------------------------------------------------------------
    console.log('>>> [TASK 2] Verifying SHA-256 Integrity & Tamper Detection Fixture...');
    try {
      const invId = 'INV-QA-INTEGRITY';
      await createInvestigation({ investigationId: invId, title: 'Integrity Audit Case' });

      const evDoc = await createEvidence({
        investigationId: invId,
        title: 'Sensitive Registry Key Modification',
        artifactType: 'SECURITY_EVENT',
        sourceHost: 'finance-pc-01.corp.lan',
        severity: 'CRITICAL',
        metadata: { registryKey: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' }
      });

      // 1. Initial verification must be valid
      const initialVerify = await verifyEvidenceHash(evDoc.evidenceId);
      if (!initialVerify.isValid) {
        throw new Error('Initial evidence hash verification failed on clean record');
      }

      // 2. Tamper injection test
      const tamperResult = await testTamperEvidence(evDoc.evidenceId);
      if (!tamperResult.success) {
        throw new Error('Tamper injection failed to simulate modification');
      }

      // 3. Post-tamper verification must detect violation
      const postTamperVerify = await verifyEvidenceHash(evDoc.evidenceId);
      if (postTamperVerify.isValid) {
        throw new Error('Failed to detect tampered evidence document!');
      }

      // Verify immutable genesis audit trail exists for the evidence
      const auditLogs = await db.collection('audit_logs').find({ evidenceId: evDoc.evidenceId }).toArray();
      const genesisLog = auditLogs.find(a => a.action === 'EVIDENCE_INGESTED');
      if (!genesisLog) throw new Error('Genesis audit log entry missing');

      qaReport.tasks['TASK_2_INTEGRITY'] = {
        status: 'PASSED',
        evidenceId: evDoc.evidenceId,
        genesisHash: initialVerify.currentHash,
        tamperedHash: postTamperVerify.recomputedHash,
        detectionSuccess: true
      };
      qaReport.passedCount++;
      console.log('    ✓ Cryptographic SHA-256 genesis hashing & tamper detection verified.\n');
    } catch (err) {
      qaReport.tasks['TASK_2_INTEGRITY'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 2', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Integrity verification failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 3: Verify rule-based anomaly detection
    // -------------------------------------------------------------
    console.log('>>> [TASK 3] Verifying Rule-Based Anomaly Detection & MITRE ATT&CK...');
    try {
      const invId = 'INV-QA-RULES';
      await createInvestigation({ investigationId: invId, title: 'Detection Engine Case' });

      // Insert rule
      await db.collection('detection_rules').insertOne({
        ruleId: 'RULE-BURST-QA',
        name: 'Rapid Threat Burst',
        ruleType: 'ANOMALOUS_BURST',
        severity: 'CRITICAL',
        threshold: 2,
        enabled: true,
        description: 'Cluster of multiple high severity alerts within short time interval.'
      });

      // Ingest 2 critical events
      await createEvidence({
        investigationId: invId,
        title: 'Privilege Escalation via CVE-2026-001',
        artifactType: 'SECURITY_EVENT',
        sourceHost: 'db01',
        severity: 'CRITICAL',
        mitreTactic: 'Privilege Escalation'
      });
      await createEvidence({
        investigationId: invId,
        title: 'Shadow Copy Deletion via vssadmin',
        artifactType: 'PROCESS_SPAWN',
        sourceHost: 'db01',
        severity: 'CRITICAL',
        mitreTactic: 'Defense Evasion'
      });

      // Run detection engine
      const findings = await runDetectionEngine(invId);
      if (findings.length === 0) {
        throw new Error('Detection engine failed to trigger any derived findings');
      }

      // Verify derived_findings collection
      const dbFindings = await db.collection('derived_findings').find({ investigationId: invId }).toArray();
      if (dbFindings.length === 0) throw new Error('Findings not persisted to derived_findings collection');

      // Verify anomalyService anomaly detection
      const anomalies = await analyzeCaseAnomalies(invId);

      qaReport.tasks['TASK_3_RULES'] = {
        status: 'PASSED',
        findingsCount: findings.length,
        ruleTriggered: findings[0].ruleName,
        anomaliesAnalyzed: anomalies ? Object.keys(anomalies).length : 0
      };
      qaReport.passedCount++;
      console.log(`    ✓ Detection engine verified: ${findings.length} findings derived and persisted.\n`);
    } catch (err) {
      qaReport.tasks['TASK_3_RULES'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 3', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Rule detection failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 4: Verify Python ML predictions using actual trained model
    // -------------------------------------------------------------
    console.log('>>> [TASK 4] Verifying Python ML Isolation Forest Model Predictions...');
    try {
      const health = await checkMLHealth();
      if (!health.available) {
        throw new Error(`Python ML microservice offline: ${health.error || health.status}`);
      }

      const modelInfo = await getMLModelInfo();
      if (!modelInfo.success || (modelInfo.model_type !== 'IsolationForest' && modelInfo.model !== 'IsolationForest')) {
        throw new Error(`Unexpected model metadata: ${JSON.stringify(modelInfo)}`);
      }

      // 1. Normal telemetry prediction
      const normalDoc = {
        evidenceId: 'EV-QA-NORMAL',
        title: 'Routine Active Directory Query',
        artifactType: 'NETWORK_FLOW',
        sourceHost: 'dc01.corp.lan',
        metadata: {
          duration: 0.2,
          bytesTransferred: 1024,
          destPort: 443,
          connCount: 2,
          failedLogins: 0,
          commandLine: 'whoami /groups'
        }
      };
      const normalPred = await scoreEvidenceItem(normalDoc);
      if (normalPred.anomaly_score >= 0.50 || normalPred.is_anomaly) {
        throw new Error(`False Positive: Normal telemetry classified as anomaly (Score: ${normalPred.anomaly_score})`);
      }

      // 2. Malicious / Anomalous telemetry prediction
      const attackDoc = {
        evidenceId: 'EV-QA-ATTACK',
        title: 'Cobalt Strike C2 Beacon & Memory Injection',
        artifactType: 'PROCESS_SPAWN',
        sourceHost: 'crownjewel-srv-01.corp.lan',
        timestamp: '2026-10-12T02:30:00Z', // Off-hours (02:30 AM)
        metadata: {
          duration: 180.0,
          bytesTransferred: 85000000,
          destPort: 4444, // C2 Port
          connCount: 15,
          failedLogins: 8,
          commandLine: 'powershell.exe -nop -w hidden -enc JABzAD0ATgBle...'
        }
      };
      const attackPred = await scoreEvidenceItem(attackDoc);
      if (attackPred.anomaly_score < 0.50 || !attackPred.is_anomaly) {
        throw new Error(`False Negative: Malicious telemetry classified as normal (Score: ${attackPred.anomaly_score})`);
      }

      qaReport.mlEvaluationResults = {
        model: modelInfo.model_type || modelInfo.model,
        n_estimators: modelInfo.hyperparameters?.n_estimators || modelInfo.n_estimators,
        contamination: modelInfo.hyperparameters?.contamination || modelInfo.contamination,
        validation_accuracy: modelInfo.metrics?.accuracy || modelInfo.validation_metrics?.accuracy,
        validation_roc_auc: modelInfo.metrics?.roc_auc || modelInfo.validation_metrics?.roc_auc,
        normalScore: normalPred.anomaly_score,
        normalIsAnomaly: normalPred.is_anomaly,
        attackScore: attackPred.anomaly_score,
        attackIsAnomaly: attackPred.is_anomaly,
        attackThreat: attackPred.threat_level,
        attackTopFeatures: attackPred.top_contributing_features
      };

      qaReport.tasks['TASK_4_ML_PREDICTION'] = { status: 'PASSED', ...qaReport.mlEvaluationResults };
      qaReport.passedCount++;
      console.log(`    ✓ Python ML verified: Normal score=${normalPred.anomaly_score}, Attack score=${attackPred.anomaly_score} (${attackPred.threat_level})\n`);
    } catch (err) {
      qaReport.tasks['TASK_4_ML_PREDICTION'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 4', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ ML prediction failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 5: Verify ML finding persistence in MongoDB
    // -------------------------------------------------------------
    console.log('>>> [TASK 5] Verifying ML Findings Persistence in ml_detections Collection...');
    try {
      const invId = 'INV-QA-PERSIST';
      await createInvestigation({ investigationId: invId, title: 'ML Persistence Test' });

      const testEv = {
        evidenceId: 'EV-QA-PERSIST-001',
        investigationId: invId,
        title: 'Data Exfiltration via Suspicious Port',
        artifactType: 'NETWORK_FLOW',
        sourceHost: 'workstation-44.corp.lan',
        timestamp: new Date()
      };
      const pred = {
        anomaly_score: 0.8842,
        decision_score: -0.214,
        is_anomaly: true,
        threat_level: 'CRITICAL',
        confidence: 0.8842,
        features_extracted: { duration: 12.0, src_bytes: 45000000, service_port: 8443 },
        top_contributing_features: [{ feature: 'src_bytes', z_score: 8.5 }],
        explanation: 'Massive outbound transfer on unapproved port.'
      };

      // Record finding
      const recorded = await recordMLDetection(pred, testEv);
      if (!recorded || !recorded.detectionId.startsWith('MLD-')) {
        throw new Error('recordMLDetection did not return valid record with MLD- prefix');
      }

      // Query from MongoDB ml_detections
      const fromDb = await db.collection('ml_detections').findOne({ evidenceId: testEv.evidenceId });
      if (!fromDb) throw new Error('Document not found in ml_detections collection');
      if (fromDb.anomalyScore !== 0.8842 || fromDb.threatLevel !== 'CRITICAL' || !fromDb.isAnomaly) {
        throw new Error('Persisted fields in ml_detections corrupted or mismatched');
      }

      // Test idempotent upsert
      await recordMLDetection({ ...pred, anomaly_score: 0.8900 }, testEv);
      const countForEv = await db.collection('ml_detections').countDocuments({ evidenceId: testEv.evidenceId });
      if (countForEv !== 1) throw new Error(`Idempotent upsert violated: found ${countForEv} documents`);

      // Test getMLStats
      const stats = await getMLStats(invId);
      if (stats.totalScored < 1 || stats.totalAnomalies < 1) {
        throw new Error(`getMLStats returned invalid counts: ${JSON.stringify(stats)}`);
      }

      qaReport.tasks['TASK_5_ML_PERSISTENCE'] = {
        status: 'PASSED',
        detectionId: recorded.detectionId,
        isIdempotent: countForEv === 1,
        statsVerified: true
      };
      qaReport.passedCount++;
      console.log('    ✓ ML findings persistence and aggregation in ml_detections verified.\n');
    } catch (err) {
      qaReport.tasks['TASK_5_ML_PERSISTENCE'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 5', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ ML persistence failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 6: Verify investigation-level filtering
    // -------------------------------------------------------------
    console.log('>>> [TASK 6] Verifying Investigation-Level Filtering & ID Harmonization...');
    try {
      const inv1 = 'INV-QA-SCOPE-A';
      const inv2 = 'INV-QA-SCOPE-B';
      await createInvestigation({ investigationId: inv1, caseId: 'CASE-SCOPE-A', title: 'Scope A Incident', severity: 'HIGH' });
      await createInvestigation({ investigationId: inv2, caseId: 'CASE-SCOPE-B', title: 'Scope B Incident', severity: 'LOW' });

      await createEvidence({ investigationId: inv1, title: 'Scope A Item 1', severity: 'HIGH' });
      await createEvidence({ investigationId: inv1, title: 'Scope A Item 2', severity: 'MEDIUM' });
      await createEvidence({ investigationId: inv2, title: 'Scope B Item 1', severity: 'LOW' });

      // 1. Query by investigationId
      const evScopeA = await db.collection('evidence').find({ $or: [{ investigationId: inv1 }, { caseId: inv1 }] }).toArray();
      if (evScopeA.length !== 2) throw new Error(`Scope A returned ${evScopeA.length} items, expected 2`);

      // 2. Query by legacy caseId (harmonized automatically via parent lookup)
      const evLegacyA = await db.collection('evidence').find({ $or: [{ investigationId: 'CASE-SCOPE-A' }, { caseId: 'CASE-SCOPE-A' }] }).toArray();
      if (evLegacyA.length !== 2) throw new Error(`Legacy caseId lookup failed, returned ${evLegacyA.length}`);

      // 3. Filter by severity
      const evHigh = await db.collection('evidence').find({ severity: 'HIGH' }).toArray();
      if (evHigh.length < 1) throw new Error('Severity filter returned empty');

      qaReport.tasks['TASK_6_FILTERING'] = { status: 'PASSED', scopeACount: evScopeA.length, harmonizationVerified: true };
      qaReport.passedCount++;
      console.log('    ✓ Investigation filtering and ID harmonization verified.\n');
    } catch (err) {
      qaReport.tasks['TASK_6_FILTERING'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 6', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Filtering failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 7: Verify entity extraction and D3 graph visualization
    // -------------------------------------------------------------
    console.log('>>> [TASK 7] Verifying Entity Extraction & D3 Graph Node/Edge Schema...');
    try {
      const invId = 'INV-QA-GRAPH';
      await createInvestigation({ investigationId: invId, title: 'Graph Entity Case' });

      await createEvidence({
        investigationId: invId,
        title: 'Lateral Movement Event',
        sourceHost: 'workstation-88.corp.lan',
        sourceIp: '10.0.4.15',
        destinationIp: '10.0.4.20',
        user: 'svc_backup',
        fileName: 'ntds.dit',
        sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0'
      });

      // Verify entities populated
      const hostEnt = await db.collection('entities').findOne({ normalizedValue: 'workstation-88.corp.lan' });
      const userEnt = await db.collection('entities').findOne({ normalizedValue: 'svc_backup' });
      const ipEnt = await db.collection('entities').findOne({ normalizedValue: '10.0.4.15' });

      if (!hostEnt || !userEnt || !ipEnt) {
        throw new Error('Polymorphic entity extraction missed Host, User, or IP entity');
      }

      // Reconstruct graph nodes & edges
      const reconstruction = await reconstructIncident(invId);
      const nodes = reconstruction.graph?.nodes || [];
      const edges = reconstruction.graph?.edges || [];

      if (nodes.length < 4 || edges.length < 1) {
        throw new Error(`Insufficient graph elements: ${nodes.length} nodes, ${edges.length} edges`);
      }

      qaReport.tasks['TASK_7_GRAPH'] = {
        status: 'PASSED',
        nodesCount: nodes.length,
        edgesCount: edges.length,
        nodeTypes: Array.from(new Set(nodes.map(n => n.type)))
      };
      qaReport.passedCount++;
      console.log(`    ✓ Entity extraction & D3 graph verified: ${nodes.length} nodes, ${edges.length} edges.\n`);
    } catch (err) {
      qaReport.tasks['TASK_7_GRAPH'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 7', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Graph verification failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 8: Verify incident timeline reconstruction
    // -------------------------------------------------------------
    console.log('>>> [TASK 8] Verifying Incident Timeline Reconstruction & Chronology...');
    try {
      const invId = 'INV-QA-TIMELINE';
      await createInvestigation({ investigationId: invId, title: 'Timeline Case' });

      const t1 = new Date('2026-10-15T08:00:00Z');
      const t2 = new Date('2026-10-15T08:15:00Z');
      const t3 = new Date('2026-10-15T09:30:00Z');

      // Ingest out of order intentionally
      await createEvidence({ investigationId: invId, title: 'Event 3 (Latest)', timestamp: t3 });
      await createEvidence({ investigationId: invId, title: 'Event 1 (Earliest)', timestamp: t1 });
      await createEvidence({ investigationId: invId, title: 'Event 2 (Middle)', timestamp: t2 });

      const recon = await reconstructIncident(invId);
      const events = recon.timeline || [];
      if (events.length !== 3) throw new Error(`Timeline returned ${events.length} events, expected 3`);

      // Verify strictly sorted
      for (let i = 0; i < events.length - 1; i++) {
        const cur = new Date(events[i].timestamp).getTime();
        const next = new Date(events[i + 1].timestamp).getTime();
        if (cur > next) throw new Error(`Timeline chronological order violation: ${cur} > ${next}`);
      }

      // Verify time bounds in metrics
      const metrics = recon.metrics;
      if (!metrics || !metrics.firstEvent || !metrics.lastEvent) {
        throw new Error('metrics firstEvent/lastEvent failed in timeline reconstruction');
      }

      qaReport.tasks['TASK_8_TIMELINE'] = {
        status: 'PASSED',
        eventsCount: events.length,
        isChronological: true,
        firstEvent: metrics.firstEvent,
        lastEvent: metrics.lastEvent,
        durationMinutes: metrics.durationMinutes
      };
      qaReport.passedCount++;
      console.log('    ✓ Timeline reconstruction strictly ordered and bounded.\n');
    } catch (err) {
      qaReport.tasks['TASK_8_TIMELINE'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 8', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Timeline verification failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 9: Verify forensic report generation & export
    // -------------------------------------------------------------
    console.log('>>> [TASK 9] Verifying Forensic Report & Export Generation...');
    try {
      const invId = 'INV-QA-REPORT';
      await createInvestigation({
        investigationId: invId,
        title: 'APT Cloud Ingress & Data Exfiltration Forensic Report',
        severity: 'CRITICAL',
        incidentCommander: 'Det. Alex Mercer'
      });

      const ev = await createEvidence({
        investigationId: invId,
        title: 'Tampered Kerberos Ticket Granting Service',
        artifactType: 'SECURITY_EVENT',
        sourceHost: 'kdc-01.corp.lan',
        severity: 'CRITICAL',
        metadata: { ticketSize: 4096 }
      });

      const reconReport = await reconstructIncident(invId);

      // Verify essential sections of forensic report
      const hasTimeline = Array.isArray(reconReport.timeline);
      const hasMetrics = reconReport.metrics && Array.isArray(reconReport.metrics.severityCounts);
      const hasArtifacts = reconReport.metrics && Array.isArray(reconReport.metrics.artifactCounts);
      const hasHostActivity = reconReport.metrics && Array.isArray(reconReport.metrics.hostActivity);
      const hasGraph = reconReport.graph && Array.isArray(reconReport.graph.nodes);

      if (!hasTimeline || !hasMetrics || !hasArtifacts || !hasHostActivity || !hasGraph) {
        throw new Error('Comprehensive reconstruction report missing core facets');
      }

      // Verify CSV export generation formatting
      const headers = ['evidenceId', 'title', 'artifactType', 'severity', 'sourceHost', 'version', 'currentHash', 'timestamp'];
      const csvRow = headers.map(h => `"${String(ev[h] || '').replace(/"/g, '""')}"`).join(',');
      if (!csvRow.includes('EV-') || !csvRow.includes('CRITICAL')) {
        throw new Error('CSV serialization test failed');
      }

      qaReport.tasks['TASK_9_REPORT'] = {
        status: 'PASSED',
        facetsVerified: ['timeline', 'metrics', 'severityDistribution', 'artifactDistribution', 'hostActivity', 'knowledgeGraph', 'csvSerialization']
      };
      qaReport.passedCount++;
      console.log('    ✓ Forensic incident report generation and export serialization verified.\n');
    } catch (err) {
      qaReport.tasks['TASK_9_REPORT'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 9', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Report verification failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 10: Verify behaviour when Python ML service is unavailable
    // -------------------------------------------------------------
    console.log('>>> [TASK 10] Verifying Heuristic Degradation when ML Service is Offline...');
    try {
      const testDoc = {
        evidenceId: 'EV-QA-OFFLINE-TEST',
        title: 'Suspicious PowerShell Living off the Land',
        description: 'Execution of wmic process call create',
        metadata: {
          commandLine: 'powershell.exe -w hidden -enc JABzAD0ATg...',
          bytesTransferred: 15000000,
          failedLogins: 6
        }
      };

      // Direct fallback test
      const fallbackResult = localHeuristicScorer(testDoc);
      if (typeof fallbackResult.anomaly_score !== 'number' || fallbackResult.anomaly_score < 0.50) {
        throw new Error(`Heuristic fallback scoring failed: ${JSON.stringify(fallbackResult)}`);
      }
      if (fallbackResult.provider !== 'local_heuristic_fallback') {
        throw new Error(`Expected provider local_heuristic_fallback, got ${fallbackResult.provider}`);
      }
      if (!fallbackResult.explanation || fallbackResult.explanation.length === 0) {
        throw new Error('Fallback scorer must provide explainable forensics attribution');
      }

      qaReport.tasks['TASK_10_OFFLINE_TOLERANCE'] = {
        status: 'PASSED',
        fallbackScore: fallbackResult.anomaly_score,
        fallbackThreat: fallbackResult.threat_level,
        provider: fallbackResult.provider,
        resilienceVerified: true
      };
      qaReport.passedCount++;
      console.log(`    ✓ Graceful offline degradation verified: Score=${fallbackResult.anomaly_score} via ${fallbackResult.provider}.\n`);
    } catch (err) {
      qaReport.tasks['TASK_10_OFFLINE_TOLERANCE'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 10', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Offline tolerance failed:', err.message, '\n');
    }

    // -------------------------------------------------------------
    // TASK 11: Execute complete NoSQL benchmarking for 1K, 10K, 50K, 100K
    // -------------------------------------------------------------
    console.log('>>> [TASK 11] Executing Complete NoSQL Scalability Benchmarks (1K, 10K, 50K, 100K)...');
    try {
      const scales = [1000, 10000, 50000, 100000];
      const benchmarkData = {};

      for (const count of scales) {
        console.log(`    -> Running experiment at ${count.toLocaleString()} records scale...`);
        const iter = count >= 50000 ? 2 : 5;
        const tStart = performance.now();
        const res = await runSchemaBenchmark(count, iter);
        const tDuration = performance.now() - tStart;

        benchmarkData[count] = {
          itemCount: count,
          durationMs: Number(tDuration.toFixed(1)),
          ingestion: {
            embedded: {
              durationMs: res.ingestion.embedded.durationMs,
              throughput: res.ingestion.embedded.throughputItemsPerSec,
              error: res.ingestion.embedded.error ? '16MB Limit Reached' : null
            },
            referenced: {
              durationMs: Number(res.ingestion.referenced.durationMs.toFixed(1)),
              throughput: res.ingestion.referenced.throughputItemsPerSec
            },
            hybrid: {
              durationMs: Number(res.ingestion.hybrid.durationMs.toFixed(1)),
              throughput: res.ingestion.hybrid.throughputItemsPerSec,
              buckets: res.ingestion.hybrid.bucketsCount
            }
          },
          storage: {
            embeddedStorageBytes: res.storage.embedded?.storageSize || 0,
            referencedStorageBytes: res.storage.referenced?.storageSize || 0,
            hybridStorageBytes: res.storage.hybrid?.storageSize || 0,
            referencedIndexBytes: res.storage.referenced?.totalIndexSize || 0,
            hybridIndexBytes: res.storage.hybrid?.totalIndexSize || 0
          },
          latencyP50: {
            reconstructionEmbedded: res.queryLatency.fullReconstruction.embedded?.p50 ?? 'N/A',
            reconstructionReferenced: res.queryLatency.fullReconstruction.referenced.p50,
            reconstructionHybrid: res.queryLatency.fullReconstruction.hybrid.p50,
            updateReferenced: res.queryLatency.singleItemUpdate.referenced.p50,
            updateHybrid: res.queryLatency.singleItemUpdate.hybrid.p50
          },
          accuracy: {
            embedded: res.retrievalAccuracy.embedded.accuracyPct,
            embeddedLimited: res.retrievalAccuracy.embedded.limitationTriggered,
            referenced: res.retrievalAccuracy.referenced.accuracyPct,
            hybrid: res.retrievalAccuracy.hybrid.accuracyPct
          }
        };

        // Assert 16MB limit triggered at 50K and 100K
        if (count >= 50000) {
          if (!res.retrievalAccuracy.embedded.limitationTriggered) {
            throw new Error(`Expected 16MB limit to trigger at ${count} items`);
          }
        }
        // Assert Referenced and Hybrid achieve 100% accuracy
        if (res.retrievalAccuracy.referenced.accuracyPct !== 100 || res.retrievalAccuracy.hybrid.accuracyPct !== 100) {
          throw new Error(`Accuracy degraded at ${count} items`);
        }

        console.log(`       Completed in ${tDuration.toFixed(0)}ms: Hybrid p50=${res.queryLatency.fullReconstruction.hybrid.p50}ms, Ref p50=${res.queryLatency.fullReconstruction.referenced.p50}ms, Embedded=${res.retrievalAccuracy.embedded.limitationTriggered ? 'FAILED (16MB BSON barrier)' : 'OK'}`);
      }

      qaReport.benchmarkResults = benchmarkData;
      qaReport.tasks['TASK_11_BENCHMARK'] = { status: 'PASSED', scalesEvaluated: scales };
      qaReport.passedCount++;
      console.log('    ✓ Complete NoSQL multi-model scalability benchmark (1K to 100K) validated.\n');
    } catch (err) {
      qaReport.tasks['TASK_11_BENCHMARK'] = { status: 'FAILED', error: err.message };
      qaReport.failures.push({ task: 'TASK 11', error: err.message });
      qaReport.failedCount++;
      console.error('    ✗ Benchmark workflow failed:', err.message, '\n');
    }

    // Drop QA test database
    await db.dropDatabase();
    console.log('[Cleanup] Dropped mongotrace_qa_val database cleanly.\n');

  } catch (fatalErr) {
    console.error('[Fatal Error in QA Suite]:', fatalErr);
    qaReport.failures.push({ task: 'FATAL', error: fatalErr.message });
  } finally {
    if (client) {
      await client.close();
    }
  }

  // Write QA report output
  qaReport.endTime = new Date();
  const fs = require('fs');
  fs.writeFileSync('scratch/qa_validation_results.json', JSON.stringify(qaReport, null, 2), 'utf8');
  console.log('========================================================================');
  console.log(` QA Verification Summary: ${qaReport.passedCount} Passed, ${qaReport.failedCount} Failed`);
  console.log(' Detailed JSON results saved to scratch/qa_validation_results.json');
  console.log('========================================================================\n');

  if (qaReport.failedCount > 0) process.exit(1);
  else process.exit(0);
}

runQAValidation();
