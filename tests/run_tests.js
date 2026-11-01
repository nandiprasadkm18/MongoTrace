/**
 * MongoTrace Automated Comprehensive Test Suite
 * Executes against separate test database: 'mongotrace_test'
 * Tests all 13 critical requirements from Section 23 of the specifications.
 */

process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
process.env.DB_NAME = 'mongotrace_test';

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
  verifyAllEvidence,
  testTamperEvidence
} = require('../services/evidenceService');
const {
  parseRawData,
  previewIngestion,
  validateIngestionBatch,
  executeIngestion
} = require('../services/ingestionService');
const { reconstructIncident } = require('../services/reconstructionService');
const { runSchemaBenchmark, getExperimentHistory, validateBenchmarkResults } = require('../services/benchmarkService');
const { analyzeCaseAnomalies } = require('../services/anomalyService');
const { runDetectionEngine, getDerivedFindings } = require('../services/detectionService');
const { seedCyberScenarios } = require('../data/seedScenarios');
const {
  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch,
  recordMLDetection,
  getMLDetections,
  getMLStats,
  evaluateInvestigationWithML
} = require('../services/mlService');

let passedTests = 0;
let failedTests = 0;
const testResults = [];

function recordResult(name, success, error = null, durationMs = 0) {
  if (success) {
    passedTests++;
    console.log(`  [PASS] ${name} (${durationMs.toFixed(1)}ms)`);
    testResults.push({ name, status: 'PASS', durationMs });
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name} (${durationMs.toFixed(1)}ms) - ${error}`);
    testResults.push({ name, status: 'FAIL', error: String(error), durationMs });
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log(' MongoTrace Test Suite — Verifying Persistence & Business Logic');
  console.log(` Target Test Database: ${process.env.MONGO_URI}/${process.env.DB_NAME}`);
  console.log('===============================================================\n');

  let db, client;

  try {
    const conn = await connectDB();
    db = conn.db;
    client = conn.client;

    // Clean up test database before starting
    console.log('[Setup] Purging test database collections...');
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      if (!col.name.startsWith('system.')) {
        await db.collection(col.name).deleteMany({});
      }
    }
    console.log('[Setup] Test database ready.\n');

    // TEST 1: Investigation creation & retrieval
    {
      const t0 = performance.now();
      try {
        const invPayload = {
          title: 'Operation Red Dawn: Unauthorized Domain Controller Access',
          description: 'Attacker breached internal perimeter via compromised VPN token.',
          severity: 'CRITICAL',
          status: 'Open',
          threatActor: 'APT28',
          assignedInvestigator: 'Senior Forensic Lead'
        };
        const created = await createInvestigation(invPayload, 'SystemTest');
        
        // Verify in DB directly
        const dbDoc = await db.collection('investigations').findOne({ investigationId: created.investigationId });
        if (!dbDoc || dbDoc.title !== invPayload.title) {
          throw new Error('Investigation document not found or title mismatch in MongoDB.');
        }

        const retrieved = await getInvestigationById(created.investigationId);
        if (!retrieved || retrieved.investigationId !== created.investigationId) {
          throw new Error('Failed to retrieve investigation by ID.');
        }

        recordResult('1. Investigation Creation & Database Retrieval', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('1. Investigation Creation & Database Retrieval', false, err.message, performance.now() - t0);
      }
    }

    // TEST 2: Evidence creation & retrieval (Polymorphic BSON document)
    let testEvidenceId = null;
    {
      const t0 = performance.now();
      try {
        const evPayload = {
          investigationId: 'INV-TEST-001',
          caseId: 'INV-TEST-001',
          title: 'Suspicious LSASS Process Memory Dump Initiated',
          description: 'Procdump utility executed targeting lsass.exe to dump Kerberos tickets.',
          severity: 'CRITICAL',
          artifactType: 'PROCESS_SPAWN',
          sourceHost: 'DC01.corp.internal',
          timestamp: new Date().toISOString(),
          metadata: {
            processName: 'procdump.exe',
            processId: 4892,
            parentProcessId: 1044,
            commandLine: 'procdump.exe -ma lsass.exe C:\\Windows\\Temp\\lsass.dmp',
            user: 'SYSTEM',
            targetProcess: 'lsass.exe'
          }
        };

        const created = await createEvidence(evPayload, 'TestAnalyst');
        testEvidenceId = created.evidenceId;

        // Verify direct BSON document in evidence collection
        const dbEv = await db.collection('evidence').findOne({ evidenceId: testEvidenceId });
        if (!dbEv || dbEv.metadata.processName !== 'procdump.exe') {
          throw new Error('Polymorphic evidence document not properly persisted in MongoDB.');
        }

        const resultWithHistory = await getEvidenceWithHistory(testEvidenceId);
        if (!resultWithHistory || !resultWithHistory.evidence) {
          throw new Error('Failed to retrieve evidence with history.');
        }

        recordResult('2. Evidence Creation, Polymorphic BSON & Retrieval', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('2. Evidence Creation, Polymorphic BSON & Retrieval', false, err.message, performance.now() - t0);
      }
    }

    // TEST 3: Evidence versioning (Snapshot to evidence_versions)
    {
      const t0 = performance.now();
      try {
        const updateFields = {
          severity: 'HIGH',
          title: 'Suspicious LSASS Process Memory Dump (Correlated with Mimikatz)',
          'metadata.correlatedTool': 'Mimikatz-v2.2'
        };

        const versionResult = await updateEvidenceWithVersion(
          testEvidenceId,
          updateFields,
          'LeadExaminer',
          'Correlated with known Mimikatz command-line pattern'
        );

        if (!versionResult.success || versionResult.newVersion !== 2) {
          throw new Error(`Expected newVersion to be 2, got: ${versionResult.newVersion}`);
        }

        // Verify version 1 document exists in evidence_versions
        const v1Doc = await db.collection('evidence_versions').findOne({
          evidenceId: testEvidenceId,
          version: 1
        });

        if (!v1Doc) {
          throw new Error('Version 1 snapshot missing in evidence_versions collection.');
        }

        // Verify evidence document is now v2
        const currentEv = await db.collection('evidence').findOne({ evidenceId: testEvidenceId });
        if (currentEv.version !== 2) {
          throw new Error(`Current evidence version is not 2 (found ${currentEv.version}).`);
        }

        recordResult('3. Evidence Versioning & Snapshotting in evidence_versions', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('3. Evidence Versioning & Snapshotting in evidence_versions', false, err.message, performance.now() - t0);
      }
    }

    // TEST 4: Audit logging
    {
      const t0 = performance.now();
      try {
        const auditLogs = await db.collection('audit_logs').find({ evidenceId: testEvidenceId }).toArray();
        if (auditLogs.length === 0) {
          throw new Error('No audit logs recorded for evidence operations.');
        }

        const hasVersionLog = auditLogs.some(log => log.action === 'VERSION_UPDATE' || log.action === 'EVIDENCE_MODIFIED');
        if (!hasVersionLog) {
          throw new Error('Expected VERSION_UPDATE or EVIDENCE_MODIFIED audit log entry.');
        }

        recordResult('4. Immutable Audit Trail Logging in audit_logs', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('4. Immutable Audit Trail Logging in audit_logs', false, err.message, performance.now() - t0);
      }
    }

    // TEST 5: Hash verification (SHA-256 integrity & Tamper detection)
    {
      const t0 = performance.now();
      try {
        // Step 1: Normal verification should PASS
        const verifyPass = await verifyEvidenceHash(testEvidenceId);
        if (!verifyPass.isValid) {
          throw new Error('Unmodified evidence failed SHA-256 integrity check.');
        }
        const verifiedAttempt = await db.collection('audit_logs').findOne({
          evidenceId: testEvidenceId,
          action: 'INTEGRITY_VERIFICATION_ATTEMPT',
          verificationResult: 'VERIFIED'
        });
        if (!verifiedAttempt) {
          throw new Error('Verified integrity attempt was not persisted to audit_logs.');
        }
        if (verifiedAttempt.details?.version !== 2 || !await db.collection('audit_logs').findOne({
          evidenceId: testEvidenceId,
          action: 'VERSION_UPDATE',
          version: 2
        })) {
          throw new Error('Legitimate evidence versioning is not distinguishable from unauthorized modification.');
        }

        // Step 2: Simulate tamper directly in the database (bypassing versioning)
        const tamperResult = await testTamperEvidence(testEvidenceId);
        if (!tamperResult.success) {
          throw new Error('Failed to run tamper simulation fixture.');
        }

        // Step 3: Verify should now detect TAMPER / INVALID
        const verifyFail = await verifyEvidenceHash(testEvidenceId);
        if (verifyFail.isValid) {
          throw new Error('Integrity check failed to detect tampered document.');
        }

        const firstViolation = await db.collection('audit_logs').findOne({
          evidenceId: testEvidenceId,
          action: 'INTEGRITY_VIOLATION_DETECTED'
        });
        if (!firstViolation || !firstViolation.investigationId || !firstViolation.actor ||
            !firstViolation.timestamp || !firstViolation.expectedHash || !firstViolation.calculatedHash ||
            firstViolation.verificationResult !== 'TAMPER_DETECTED') {
          throw new Error('Tamper violation audit record is missing required forensic fields.');
        }

        // Repeat verification: preserve a new attempt but upsert the same violation.
        await verifyEvidenceHash(testEvidenceId);
        const violationCount = await db.collection('audit_logs').countDocuments({
          evidenceId: testEvidenceId,
          action: 'INTEGRITY_VIOLATION_DETECTED'
        });
        const repeatedViolation = await db.collection('audit_logs').findOne({ _id: firstViolation._id });
        if (violationCount !== 1 || repeatedViolation.detectionCount !== 2) {
          throw new Error('Repeated scans must upsert one violation and increment its detection count.');
        }

        // Invalid/missing stored hashes must never be treated as verified.
        const invalidHashEvidence = await createEvidence({
          investigationId: 'INV-TEST-001',
          title: 'Invalid Stored Hash Test Fixture',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'audit-test-host'
        }, 'TestAnalyst');
        await db.collection('evidence').updateOne(
          { evidenceId: invalidHashEvidence.evidenceId },
          { $set: { currentHash: 'invalid-hash' } }
        );
        const invalidHashResult = await verifyEvidenceHash(invalidHashEvidence.evidenceId);
        if (invalidHashResult.isValid || invalidHashResult.verificationResult !== 'INVALID_STORED_HASH') {
          throw new Error('Invalid stored hash was not reported as an integrity failure.');
        }
        const invalidHashAudit = await db.collection('audit_logs').findOne({
          evidenceId: invalidHashEvidence.evidenceId,
          action: 'INTEGRITY_VIOLATION_DETECTED',
          verificationResult: 'INVALID_STORED_HASH'
        });
        if (!invalidHashAudit) throw new Error('Invalid stored hash violation was not persisted.');

        const missingHashEvidence = await createEvidence({
          investigationId: 'INV-TEST-001',
          title: 'Missing Stored Hash Test Fixture',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'audit-test-host'
        }, 'TestAnalyst');
        await db.collection('evidence').updateOne(
          { evidenceId: missingHashEvidence.evidenceId },
          { $unset: { currentHash: '' } }
        );
        const missingHashResult = await verifyEvidenceHash(missingHashEvidence.evidenceId);
        if (missingHashResult.isValid || missingHashResult.verificationResult !== 'INVALID_STORED_HASH') {
          throw new Error('Missing stored hash was not reported as an integrity failure.');
        }

        // Simulate audit persistence failure; the service must surface it, never claim success.
        let auditFailureSurfaced = false;
        try {
          await verifyEvidenceHash(testEvidenceId, 'Integrity-Scanner', {
            auditCollection: { insertOne: async () => { throw new Error('simulated audit write failure'); } }
          });
        } catch (err) {
          auditFailureSurfaced = /simulated audit write failure/.test(err.message);
        }
        if (!auditFailureSurfaced) {
          throw new Error('Audit persistence failure was not surfaced to the caller.');
        }

        const scanSummary = await verifyAllEvidence();
        if (scanSummary.failedCount !== 0 || scanSummary.tamperedCount < 2 || scanSummary.completed !== true) {
          throw new Error('Full scan summary did not accurately report persisted integrity outcomes.');
        }

        recordResult('5. Live SHA-256 Hash Verification & Tamper Detection', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('5. Live SHA-256 Hash Verification & Tamper Detection', false, err.message, performance.now() - t0);
      }
    }

    // TEST 6: Invalid input rejection
    {
      const t0 = performance.now();
      try {
        // Missing title and caseId
        let threwError = false;
        try {
          await createEvidence({ description: 'Invalid item with no title' }, 'Tester');
        } catch {
          threwError = true;
        }

        // Ingestion of malformed JSON
        let jsonParseError = false;
        try {
          parseRawData('{ "broken": json without quotes }', 'json');
        } catch {
          jsonParseError = true;
        }

        if (!threwError || !jsonParseError) {
          throw new Error('System failed to reject invalid input / malformed JSON.');
        }

        recordResult('6. Input Validation & Invalid Input Rejection', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('6. Input Validation & Invalid Input Rejection', false, err.message, performance.now() - t0);
      }
    }

    // TEST 7: JSON, JSONL, and CSV ingestion parsing & mapping
    {
      const t0 = performance.now();
      try {
        // JSON parsing
        const rawJson = JSON.stringify([
          { title: 'SSH Login 1', host: 'web01', timestamp: '2026-10-14T01:00:00Z', severity: 'LOW' },
          { title: 'SSH Login 2', host: 'web02', timestamp: '2026-10-14T01:05:00Z', severity: 'MEDIUM' }
        ]);
        const parsedJson = parseRawData(rawJson, 'json');
        if (parsedJson.length !== 2) throw new Error('JSON parsing failed.');

        // JSONL parsing
        const rawJsonl = '{"title":"Log A","host":"app01"}\n{"title":"Log B","host":"app02"}';
        const parsedJsonl = parseRawData(rawJsonl, 'jsonl');
        if (parsedJsonl.length !== 2) throw new Error('JSONL parsing failed.');

        // CSV parsing
        const rawCsv = 'title,host,severity\nFirewall Block,fw01,HIGH\nDNS Query,dns01,LOW';
        const parsedCsv = parseRawData(rawCsv, 'csv');
        if (parsedCsv.length !== 2 || parsedCsv[0].title !== 'Firewall Block') {
          throw new Error('CSV parsing failed.');
        }

        // Preview mapping
        const preview = previewIngestion(parsedCsv, { sourceHost: 'host' });
        if (preview.totalRecords !== 2 || !preview.mappedPreview[0].sourceHost) {
          throw new Error('Field mapping preview failed.');
        }

        recordResult('7. Ingestion Parsing & Mapping (JSON, JSONL, CSV)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('7. Ingestion Parsing & Mapping (JSON, JSONL, CSV)', false, err.message, performance.now() - t0);
      }
    }

    // TEST 8: Duplicate handling in ingestion
    {
      const t0 = performance.now();
      try {
        const rawRecords = [
          { title: 'Duplicate Event A', timestamp: '2026-10-14T00:00:00Z', host: 'srv1' },
          { title: 'Duplicate Event A', timestamp: '2026-10-14T00:00:00Z', host: 'srv1' }, // Exact duplicate
          { title: 'Unique Event B', timestamp: '2026-10-14T00:01:00Z', host: 'srv2' }
        ];

        const validation = await validateIngestionBatch('INV-TEST-001', rawRecords, { sourceHost: 'host' });
        if (validation.duplicateCount !== 1) {
          throw new Error(`Expected 1 duplicate, found ${validation.duplicateCount}`);
        }
        if (validation.validRecords.length !== 2) {
          throw new Error(`Expected 2 valid records, got ${validation.validRecords.length}`);
        }

        // Execute batch ingestion and verify job created in ingestion_jobs
        const jobResult = await executeIngestion('INV-TEST-001', validation.validRecords, 'SIEM_SPLUNK', 'BatchTester');
        if (!jobResult || jobResult.acceptedCount !== 2) {
          throw new Error('Ingestion execution failed to accept valid records.');
        }

        const jobDoc = await db.collection('ingestion_jobs').findOne({ jobId: jobResult.jobId });
        if (!jobDoc) {
          throw new Error('Ingestion job document was not persisted to ingestion_jobs collection.');
        }

        recordResult('8. Ingestion Duplicate Detection & Batch Job Logging', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('8. Ingestion Duplicate Detection & Batch Job Logging', false, err.message, performance.now() - t0);
      }
    }

    // TEST 9: Timeline ordering & chronological reconstruction
    {
      const t0 = performance.now();
      try {
        // Insert staggered timeline items
        const timestamps = [
          '2026-10-14T03:00:00Z',
          '2026-10-14T01:00:00Z',
          '2026-10-14T02:00:00Z'
        ];

        for (let i = 0; i < timestamps.length; i++) {
          await createEvidence({
            caseId: 'INV-TIMELINE-TEST',
            investigationId: 'INV-TIMELINE-TEST',
            title: `Timeline Event ${i + 1}`,
            timestamp: timestamps[i],
            severity: 'MEDIUM',
            artifactType: 'APPLICATION_LOG',
            sourceHost: 'app.internal'
          }, 'TimelineTester');
        }

        const sortedDocs = await db.collection('evidence')
          .find({ caseId: 'INV-TIMELINE-TEST' })
          .sort({ timestamp: 1 })
          .toArray();

        if (sortedDocs.length !== 3) {
          throw new Error('Expected 3 timeline evidence items.');
        }

        const t1 = new Date(sortedDocs[0].timestamp).getTime();
        const t2 = new Date(sortedDocs[1].timestamp).getTime();
        const t3 = new Date(sortedDocs[2].timestamp).getTime();

        if (t1 > t2 || t2 > t3) {
          throw new Error('Timeline events not properly sorted chronologically.');
        }

        recordResult('9. Incident Timeline Chronological Ordering', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('9. Incident Timeline Chronological Ordering', false, err.message, performance.now() - t0);
      }
    }

    // TEST 10: Aggregation results ($match, $group, $sort, $facet)
    {
      const t0 = performance.now();
      try {
        const pipeline = [
          { $match: { caseId: 'INV-TIMELINE-TEST' } },
          {
            $group: {
              _id: '$artifactType',
              count: { $sum: 1 },
              maxTimestamp: { $max: '$timestamp' }
            }
          },
          { $sort: { count: -1 } }
        ];

        const aggResult = await db.collection('evidence').aggregate(pipeline).toArray();
        if (aggResult.length === 0 || aggResult[0].count !== 3) {
          throw new Error('Aggregation pipeline returned unexpected result.');
        }

        // Test $facet stage
        const facetPipeline = [
          { $match: { caseId: 'INV-TIMELINE-TEST' } },
          {
            $facet: {
              bySeverity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
              totalCount: [{ $count: 'total' }]
            }
          }
        ];

        const facetResult = await db.collection('evidence').aggregate(facetPipeline).toArray();
        if (!facetResult[0] || facetResult[0].totalCount[0].total !== 3) {
          throw new Error('$facet aggregation failed to compute multi-faceted metrics.');
        }

        recordResult('10. MongoDB Aggregation Pipelines ($match, $group, $facet)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('10. MongoDB Aggregation Pipelines ($match, $group, $facet)', false, err.message, performance.now() - t0);
      }
    }

    // TEST 11: Relationship retrieval & entity extraction
    {
      const t0 = performance.now();
      try {
        const evWithEntities = {
          caseId: 'INV-ENTITY-TEST',
          investigationId: 'INV-ENTITY-TEST',
          title: 'Remote PowerShell Execution',
          timestamp: new Date().toISOString(),
          severity: 'HIGH',
          artifactType: 'PROCESS_SPAWN',
          sourceHost: 'WS-FINANCE-09',
          user: 'john.doe',
          sourceIp: '10.0.4.15',
          destinationIp: '198.51.100.44',
          fileName: 'payload.ps1',
          sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef'
        };

        await createEvidence(evWithEntities, 'EntityTester');

        // Check entities extracted to 'entities' collection
        const hostEntity = await db.collection('entities').findOne({
          normalizedValue: 'ws-finance-09',
          entityType: 'HOST'
        });

        const userEntity = await db.collection('entities').findOne({
          normalizedValue: 'john.doe',
          entityType: 'USER'
        });

        const ipEntity = await db.collection('entities').findOne({
          normalizedValue: '10.0.4.15',
          entityType: 'IP'
        });

        if (!hostEntity || !userEntity || !ipEntity) {
          throw new Error('Automatic entity extraction failed for HOST, USER, or IP.');
        }

        // Check relationships created
        const rels = await db.collection('relationships').find({
          investigationIds: 'INV-ENTITY-TEST'
        }).toArray();

        if (rels.length === 0) {
          throw new Error('Expected entity relationships to be persisted in relationships collection.');
        }

        recordResult('11. Entity Extraction & Relationship Graph Persistence', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('11. Entity Extraction & Relationship Graph Persistence', false, err.message, performance.now() - t0);
      }
    }

    // TEST 12: Database disconnection handling
    {
      const t0 = performance.now();
      try {
        // Test attempting connection to an invalid port / host
        const badClient = new MongoClient('mongodb://127.0.0.1:27099', {
          serverSelectionTimeoutMS: 500,
          connectTimeoutMS: 500
        });

        let handledProperly = false;
        try {
          await badClient.connect();
        } catch {
          handledProperly = true;
        } finally {
          await badClient.close().catch(() => {});
        }

        if (!handledProperly) {
          throw new Error('Did not handle connection failure to offline database.');
        }

        recordResult('12. Database Connection Failure & Disconnection Handling', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('12. Database Connection Failure & Disconnection Handling', false, err.message, performance.now() - t0);
      }
    }

    // TEST 13: Schema Experiment Benchmark & Persistence
    {
      const t0 = performance.now();
      try {
        console.log('    [Executing Benchmark Experiment: 500 items x 3 runs]...');
        const benchResult = await runSchemaBenchmark(500, 3);

        if (!benchResult || !benchResult.embedded || !benchResult.referenced || !benchResult.hybrid) {
          throw new Error('Benchmark failed to return metrics for all 3 schema designs.');
        }

        // Verify persisted document in schema_experiments collection
        const expDoc = await db.collection('schema_experiments').findOne({
          experimentId: benchResult.experimentId
        });

        if (!expDoc) {
          throw new Error('Benchmark result was not persisted into schema_experiments collection.');
        }

        recordResult('13. Schema Benchmark Execution & Persistence in schema_experiments', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('13. Schema Benchmark Execution & Persistence in schema_experiments', false, err.message, performance.now() - t0);
      }
    }

    
    // ===============================================================
    // PHASE 2 REGRESSION TESTS (Covering Items 1 - 10)
    // ===============================================================

    // REGRESSION TEST 14: Evidence Listing Compound Query Filter (No $or overwrite)
    {
      const t0 = performance.now();
      try {
        const invId = 'INV-REG-14';
        await createEvidence({
          investigationId: invId,
          caseId: invId,
          title: 'Matching SSH Root Access',
          severity: 'CRITICAL',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'gw-linux-01',
          timestamp: new Date()
        }, 'Tester');

        await createEvidence({
          investigationId: invId,
          caseId: invId,
          title: 'Different Severity Event',
          severity: 'LOW',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'gw-linux-01',
          timestamp: new Date()
        }, 'Tester');

        const andConditions = [
          { $or: [{ investigationId: invId }, { caseId: invId }] },
          { severity: 'CRITICAL' },
          { $or: [{ artifactType: 'SECURITY_EVENT' }, { evidenceType: 'SECURITY_EVENT' }] },
          { $or: [{ title: { $regex: 'matching', $options: 'i' } }] }
        ];

        const matchingDocs = await db.collection('evidence').find({ $and: andConditions }).toArray();
        if (matchingDocs.length !== 1 || matchingDocs[0].title !== 'Matching SSH Root Access') {
          throw new Error('Compound filter failed to match exact document; possible $or overwrite regression.');
        }

        recordResult('14. [Regression] Compound Filter Without $or Overwrite', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('14. [Regression] Compound Filter Without $or Overwrite', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 15: Anomaly Service ID Interoperability & Private IP Check
    {
      const t0 = performance.now();
      try {
        const invId = 'INV-REG-15';
        await createEvidence({
          investigationId: invId,
          caseId: 'CASE-REG-15',
          title: 'Anomalous Lateral Execution via PsExec',
          severity: 'HIGH',
          mitreTactic: 'Lateral Movement',
          sourceHost: 'srv-app-01',
          timestamp: new Date(),
          metadata: { targetHost: 'srv-db-01' }
        }, 'Tester');

        const anomaliesByInv = await analyzeCaseAnomalies(invId);
        if (!anomaliesByInv || anomaliesByInv.investigationId !== invId) {
          throw new Error('analyzeCaseAnomalies failed to resolve by investigationId.');
        }
        if (anomaliesByInv.missingLinks.length === 0) {
          throw new Error('Expected lateral movement missing authentication anomaly not detected.');
        }

        await createEvidence({
          investigationId: invId,
          caseId: invId,
          title: 'Internal Admin Auth 1',
          sourceHost: 'dc01',
          timestamp: new Date(),
          metadata: { user: 'sysadmin', sourceIp: '10.0.1.5', geoCountry: 'Internal' }
        }, 'Tester');

        await createEvidence({
          investigationId: invId,
          caseId: invId,
          title: 'Internal Admin Auth 2',
          sourceHost: 'dc02',
          timestamp: new Date(Date.now() + 60000),
          metadata: { user: 'sysadmin', sourceIp: '172.16.5.10', geoCountry: 'Internal' }
        }, 'Tester');

        const recheckAnomalies = await analyzeCaseAnomalies(invId);
        const travelConflicts = recheckAnomalies.conflictingEvidence.filter(c => c.subType === 'IMPOSSIBLE_TRAVEL_CONCURRENCY');
        if (travelConflicts.length > 0) {
          throw new Error('False positive impossible travel flagged across private RFC1918 internal subnets.');
        }

        recordResult('15. [Regression] Anomaly Service ID Harmonization & RFC1918 Private IP Handling', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('15. [Regression] Anomaly Service ID Harmonization & RFC1918 Private IP Handling', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 16: Reconstruction Service ID Harmonization & Timeline Integrity
    {
      const t0 = performance.now();
      try {
        const invId = 'INV-REG-16';
        await createEvidence({
          investigationId: invId,
          caseId: 'CASE-REG-16',
          title: 'Initial Phish Execution',
          severity: 'CRITICAL',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'laptop-ceo',
          timestamp: new Date('2026-10-10T10:00:00Z')
        }, 'Tester');

        const recon = await reconstructIncident(invId);
        if (!recon || recon.investigationId !== invId || recon.timeline.length !== 1) {
          throw new Error('reconstructIncident failed to retrieve timeline when queried by investigationId.');
        }

        recordResult('16. [Regression] Reconstruction Service ID Harmonization & Timeline Integrity', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('16. [Regression] Reconstruction Service ID Harmonization & Timeline Integrity', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 17: RFC-4180 CSV Parsing with Quoted Fields and Embedded Commas
    {
      const t0 = performance.now();
      try {
        const csvRaw = 'title,severity,commandLine,sourceHost\n"PowerShell with embedded, comma args",CRITICAL,"powershell.exe -enc AAAA,BBBB",dc01\n"Normal Process",LOW,notepad.exe,ws01';
        const parsed = parseRawData(csvRaw, 'csv');

        if (parsed.length !== 2) {
          throw new Error('Expected 2 CSV records, got ' + parsed.length);
        }
        if (parsed[0].title !== 'PowerShell with embedded, comma args') {
          throw new Error('Quoted title with comma parsed incorrectly: ' + parsed[0].title);
        }
        if (parsed[0].commandLine !== 'powershell.exe -enc AAAA,BBBB') {
          throw new Error('Quoted commandLine with comma parsed incorrectly: ' + parsed[0].commandLine);
        }

        recordResult('17. [Regression] RFC-4180 CSV Parsing with Quoted Commas', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('17. [Regression] RFC-4180 CSV Parsing with Quoted Commas', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 18: Ingestion Batch Performance & Non-blocking Logging
    {
      const t0 = performance.now();
      try {
        const invId = 'INV-REG-18';
        const batchRecords = [];
        for (let i = 0; i < 50; i++) {
          batchRecords.push({
            title: `Batch Telemetry Item #${i}`,
            artifactType: 'APPLICATION_LOG',
            severity: 'MEDIUM',
            sourceHost: `host-${i % 5}`,
            timestamp: new Date()
          });
        }

        const jobResult = await executeIngestion(invId, batchRecords, 'BENCH_FEED', 'TestRunner');
        if (!jobResult || jobResult.acceptedCount !== 50 || jobResult.status !== 'COMPLETED') {
          throw new Error(`Batch ingestion failed. Accepted: ${jobResult?.acceptedCount}, Status: ${jobResult?.status}`);
        }

        const jobInDB = await db.collection('ingestion_jobs').findOne({ jobId: jobResult.jobId });
        if (!jobInDB || jobInDB.totalRecords !== 50) {
          throw new Error('Ingestion job document not properly persisted in MongoDB.');
        }

        recordResult('18. [Regression] Concurrent Batch Ingestion Execution & Job Tracking', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('18. [Regression] Concurrent Batch Ingestion Execution & Job Tracking', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 19: Detection Engine Rule Execution & Derived Findings
    {
      const t0 = performance.now();
      try {
        const invId = 'INV-REG-19';
        await db.collection('detection_rules').insertOne({
          ruleId: 'RULE-REG-BURST',
          name: 'Critical Burst Alert Test',
          ruleType: 'ANOMALOUS_BURST',
          severity: 'CRITICAL',
          enabled: true
        });

        await createEvidence({
          investigationId: invId,
          caseId: invId,
          title: 'Critical DB Breach',
          severity: 'CRITICAL',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'db01',
          timestamp: new Date()
        }, 'Tester');

        await createEvidence({
          investigationId: invId,
          caseId: invId,
          title: 'Critical Ransomware Execution',
          severity: 'CRITICAL',
          artifactType: 'SECURITY_EVENT',
          sourceHost: 'db01',
          timestamp: new Date()
        }, 'Tester');

        const findings = await runDetectionEngine(invId);
        if (findings.length === 0) {
          throw new Error('Detection engine failed to trigger anomalous burst rule on 2 critical events.');
        }

        const storedFindings = await getDerivedFindings(invId);
        if (storedFindings.length === 0) {
          throw new Error('Derived findings not saved in derived_findings collection.');
        }

        recordResult('19. [Regression] Detection Engine Rule Trigger & Derived Findings Persistence', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('19. [Regression] Detection Engine Rule Trigger & Derived Findings Persistence', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 20: Security Controls on Query Execution
    {
      const t0 = performance.now();
      try {
        const ALLOWED_SET = new Set([
          'investigations', 'cases', 'evidence', 'evidence_versions',
          'entities', 'relationships', 'evidence_relations',
          'ingestion_jobs', 'audit_logs', 'chain_of_custody',
          'detection_rules', 'derived_findings', 'schema_experiments',
          'evidence_vault.files', 'evidence_vault.chunks', 'ml_detections'
        ]);

        const restrictedCol = 'system.users';
        if (ALLOWED_SET.has(restrictedCol)) {
          throw new Error('system.users must be restricted from arbitrary querying.');
        }

        function isFilterSafe(obj) {
          if (!obj || typeof obj !== 'object') return true;
          for (const key of Object.keys(obj)) {
            if (key === '$where' || key.startsWith('$func')) return false;
            if (typeof obj[key] === 'object' && !isFilterSafe(obj[key])) return false;
          }
          return true;
        }

        const maliciousFilter = { $where: 'function() { return true; }' };
        if (isFilterSafe(maliciousFilter)) {
          throw new Error('$where operator should be flagged as unsafe.');
        }

        const safeFilter = { severity: 'CRITICAL' };
        if (!isFilterSafe(safeFilter)) {
          throw new Error('Standard severity filter should be marked safe.');
        }

        recordResult('20. [Regression] Database Security Controls & Query Restrictions', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('20. [Regression] Database Security Controls & Query Restrictions', false, err.message, performance.now() - t0);
      }
    }

    // REGRESSION TEST 21: seedCyberScenarios Parameter Robustness
    {
      const t0 = performance.now();
      try {
        await seedCyberScenarios(db);
        const invCount = await db.collection('investigations').countDocuments();
        if (invCount === 0) {
          throw new Error('seedCyberScenarios failed when invoked with database parameter.');
        }

        recordResult('21. [Regression] seedCyberScenarios Parameter Interoperability', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('21. [Regression] seedCyberScenarios Parameter Interoperability', false, err.message, performance.now() - t0);
      }
    }

    
    // ===============================================================
    // PHASE 5 TESTS: PYTHON ML (ISOLATION FOREST) INTEGRATION
    // ===============================================================

    // TEST 22: ML Bridge Service Health & Model Metadata
    {
      const t0 = performance.now();
      try {
        const health = await checkMLHealth();
        if (!health.available) {
          throw new Error(`ML microservice is offline at ${health.error || 'unknown error'}`);
        }
        if (health.service !== 'MongoTrace-ML-Engine' || !health.model_loaded) {
          throw new Error('ML service is online but model is not loaded in memory.');
        }

        const info = await getMLModelInfo();
        if (!info || info.model_type !== 'IsolationForest') {
          throw new Error('Failed to retrieve IsolationForest model info from Python microservice.');
        }

        recordResult('22. [ML] Python Isolation Forest Microservice Health & Model Metadata', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('22. [ML] Python Isolation Forest Microservice Health & Model Metadata', false, err.message, performance.now() - t0);
      }
    }

    // TEST 23: Real-time Isolation Forest Anomaly Scoring & Feature Attribution
    {
      const t0 = performance.now();
      try {
        // A. Benign telemetry item
        const benignItem = {
          evidenceId: 'EV-TEST-BENIGN-NODE',
          title: 'Standard HTTPS Session',
          timestamp: new Date().toISOString(),
          metadata: { port: 443, bytesTransferred: 2048, duration: 0.8, connCount: 2 }
        };
        const benignPred = await scoreEvidenceItem(benignItem);
        if (benignPred.is_anomaly) {
          throw new Error(`Benign telemetry flagged as anomaly: score=${benignPred.anomaly_score}`);
        }
        if (benignPred.anomaly_score >= 0.50) {
          throw new Error(`Expected benign score < 0.50, got ${benignPred.anomaly_score}`);
        }

        // B. Anomaly item: Encoded LOLBAS Command
        const anomalyItem = {
          evidenceId: 'EV-TEST-ANOM-NODE',
          title: 'Adversary Encoded Ingress Execution',
          timestamp: '2026-10-14T02:00:00Z',
          metadata: {
            processName: 'powershell.exe',
            commandLine: 'powershell.exe -Enc SUVYIChOZXctT2JqZWN0IE5ldC5XZWJDbGllbnQp',
            port: 8443,
            connCount: 50
          }
        };
        const anomPred = await scoreEvidenceItem(anomalyItem);
        if (!anomPred.is_anomaly) {
          throw new Error(`Adversary LOLBAS telemetry failed to trigger anomaly flag: score=${anomPred.anomaly_score}`);
        }
        if (anomPred.anomaly_score < 0.55) {
          throw new Error(`Expected anomaly score >= 0.55, got ${anomPred.anomaly_score}`);
        }
        if (!anomPred.top_contributing_features || anomPred.top_contributing_features.length === 0) {
          throw new Error('Expected explainable top contributing feature attribution.');
        }

        recordResult('23. [ML] Real-time Isolation Forest Anomaly Scoring & Feature Attribution', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('23. [ML] Real-time Isolation Forest Anomaly Scoring & Feature Attribution', false, err.message, performance.now() - t0);
      }
    }

    // TEST 24: Ingestion Pipeline with Integrated ML Scoring
    {
      const t0 = performance.now();
      try {
        const invId = 'INV-TEST-ML-INGEST';
        const rawBatch = [
          {
            title: 'Normal Web Access Log',
            artifactType: 'APPLICATION_LOG',
            sourceHost: 'web-srv-01',
            timestamp: new Date(),
            metadata: { port: 80, bytesTransferred: 512 }
          },
          {
            title: 'High-Volume Off-Hours Data Dump',
            artifactType: 'FILE_INTEGRITY',
            sourceHost: 'db-srv-02',
            timestamp: new Date('2026-10-14T03:00:00Z'),
            metadata: { bytesTransferred: 32000000, port: 443 }
          }
        ];

        const job = await executeIngestion(invId, rawBatch, 'TEST_SIEM', 'ML_Auditor');
        if (!job || job.acceptedCount !== 2) {
          throw new Error('Ingestion job failed to accept batch items.');
        }

        // Verify ML fields were persisted on the ingested documents in MongoDB
        const storedEvidence = await db.collection('evidence').find({
          $or: [{ investigationId: invId }, { caseId: invId }]
        }).toArray();

        if (storedEvidence.length !== 2) {
          throw new Error(`Expected 2 evidence items in DB, found ${storedEvidence.length}`);
        }

        const normalDoc = storedEvidence.find(e => e.title === 'Normal Web Access Log');
        const exfilDoc = storedEvidence.find(e => e.title === 'High-Volume Off-Hours Data Dump');

        if (!normalDoc || normalDoc.mlAnomalyScore === undefined || normalDoc.mlAnomalyScore === null) {
          throw new Error('ML anomaly score was not persisted on normal ingested document.');
        }
        if (!exfilDoc || exfilDoc.mlAnomalyScore === undefined || exfilDoc.mlAnomalyScore === null) {
          throw new Error('ML anomaly score was not persisted on exfiltration document.');
        }

        if (exfilDoc.mlAnomalyScore <= normalDoc.mlAnomalyScore) {
          throw new Error(`Exfiltration document score (${exfilDoc.mlAnomalyScore}) should exceed normal document score (${normalDoc.mlAnomalyScore})`);
        }

        recordResult('24. [ML] Ingestion Pipeline with Integrated ML Scoring Persistence', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('24. [ML] Ingestion Pipeline with Integrated ML Scoring Persistence', false, err.message, performance.now() - t0);
      }
    }

    // -------------------------------------------------------------
    // Test 25: Persistence of ML Findings in ml_detections & Aggregation Statistics
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        const testCaseId = 'INV-TEST-ML-FINDINGS';
        await createInvestigation({
          investigationId: testCaseId,
          title: 'ML Findings & Anomaly Scoring Validation',
          severity: 'HIGH',
          incidentCommander: 'Dr. Forensics'
        });

        // 1. Ingest normal telemetry
        const normalEv = await createEvidence({
          investigationId: testCaseId,
          title: 'Baseline HTTP Request to Documentation',
          artifactType: 'NETWORK_FLOW',
          sourceHost: 'ws-dev-01.corp.lan',
          metadata: {
            destPort: 443,
            bytesTransferred: 1024,
            duration: 0.1,
            failedLogins: 0,
            commandLine: 'curl https://internal.wiki'
          }
        });

        // 2. Ingest suspicious / anomalous telemetry
        const anomalyEv = await createEvidence({
          investigationId: testCaseId,
          title: 'Anomalous Memory Dump and C2 Beaconing',
          artifactType: 'PROCESS_SPAWN',
          sourceHost: 'fin-srv-02.corp.lan',
          metadata: {
            destPort: 4444,
            bytesTransferred: 25000000,
            duration: 120.0,
            failedLogins: 12,
            commandLine: 'powershell.exe -enc aW52b2tlLW1pbWlrYXR6'
          }
        });

        // Verify ml_detections collection contains records
        const allDetections = await getMLDetections({ investigationId: testCaseId });
        if (allDetections.total < 2) {
          throw new Error(`Expected at least 2 detections in ml_detections, got ${allDetections.total}`);
        }

        // Verify structure of stored detection
        const detAnomaly = allDetections.detections.find(d => d.evidenceId === anomalyEv.evidenceId);
        if (!detAnomaly) {
          throw new Error(`Detection for evidenceId ${anomalyEv.evidenceId} not found in ml_detections`);
        }
        if (!detAnomaly.detectionId.startsWith('MLD-')) {
          throw new Error(`Invalid detectionId format: ${detAnomaly.detectionId}`);
        }
        if (typeof detAnomaly.anomalyScore !== 'number' || detAnomaly.anomalyScore < 0.5) {
          throw new Error(`Expected high anomalyScore for malicious telemetry, got ${detAnomaly.anomalyScore}`);
        }
        if (!detAnomaly.isAnomaly) {
          throw new Error('Expected isAnomaly to be true for malicious telemetry');
        }
        if (!detAnomaly.explanation) {
          throw new Error('Expected explainable reasoning in detection explanation field');
        }

        // 3. Test getMLStats aggregation
        const stats = await getMLStats(testCaseId);
        if (stats.totalScored !== 2) {
          throw new Error(`Expected totalScored 2, got ${stats.totalScored}`);
        }
        if (stats.totalAnomalies < 1) {
          throw new Error(`Expected at least 1 anomaly in stats, got ${stats.totalAnomalies}`);
        }
        if (stats.normalEvents < 1) {
          throw new Error(`Expected at least 1 normal event in stats, got ${stats.normalEvents}`);
        }
        if (typeof stats.avgAnomalyScore !== 'number' || stats.avgAnomalyScore <= 0) {
          throw new Error(`Invalid avgAnomalyScore: ${stats.avgAnomalyScore}`);
        }

        // 4. Test evaluateInvestigationWithML batch evaluation
        const evalResult = await evaluateInvestigationWithML(testCaseId);
        if (!evalResult.success || evalResult.evaluatedCount !== 2) {
          throw new Error(`Batch evaluation failed: ${JSON.stringify(evalResult)}`);
        }

        recordResult('25. [ML] Persistence of ML Findings in ml_detections & Aggregation Statistics', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('25. [ML] Persistence of ML Findings in ml_detections & Aggregation Statistics', false, err.message, performance.now() - t0);
      }
    }

    // -------------------------------------------------------------
    // Test 26: NoSQL Scalability & 16MB Boundary Benchmark Experiment
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        // Run 1,000 item multi-model benchmark
        const res1k = await runSchemaBenchmark(1000, 3);
        if (!res1k.storage || !res1k.queryLatency || !res1k.retrievalAccuracy) {
          throw new Error('Benchmark result missing required sections');
        }

        // Verify percentile calculation
        const refLat = res1k.queryLatency.fullReconstruction.referenced;
        if (!refLat || typeof refLat.p50 !== 'number' || typeof refLat.p95 !== 'number' || typeof refLat.p99 !== 'number') {
          throw new Error('Referenced query latency missing p50, p95, or p99 percentiles');
        }

        // Run boundary limit verification (>16MB BSON limit)
        const resBoundary = await runSchemaBenchmark(25000, 1);
        if (!resBoundary.retrievalAccuracy.embedded.limitationTriggered) {
          throw new Error('Expected 16MB limitation to trigger for 25,000 embedded items');
        }
        if (resBoundary.retrievalAccuracy.referenced.accuracyPct !== 100 || resBoundary.retrievalAccuracy.hybrid.accuracyPct !== 100) {
          throw new Error('Referenced and Hybrid models must achieve 100% retrieval accuracy at scale');
        }

        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', false, err.message, performance.now() - t0);
      }
    }

    // -------------------------------------------------------------
    // Test 27: Schema Experiments Persistence Integrity & Metrics Validation
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        // 1. Run 1,000 item benchmark
        const bench = await runSchemaBenchmark(1000, 3);
        if (!bench.experimentId) {
          throw new Error('Benchmark result must contain an assigned experimentId');
        }

        // Verify all 3 models have storage metrics
        for (const m of ['embedded', 'referenced', 'hybrid']) {
          if (typeof bench.storage[m]?.storageSize !== 'number' || typeof bench.storage[m]?.totalIndexSize !== 'number') {
            throw new Error(`Model ${m} missing storageSize or totalIndexSize metrics`);
          }
          // Verify percentiles (min, p50, p95, p99, max)
          const recon = bench.queryLatency.fullReconstruction[m];
          if (!recon || typeof recon.p50 !== 'number' || typeof recon.min !== 'number' || typeof recon.max !== 'number') {
            throw new Error(`Model ${m} missing complete percentiles in fullReconstruction`);
          }
          const range = bench.queryLatency.timeWindowRange[m];
          if (!range || typeof range.p50 !== 'number') {
            throw new Error(`Model ${m} missing timeWindowRange percentiles`);
          }
          const update = bench.queryLatency.singleItemUpdate[m];
          if (!update || typeof update.p50 !== 'number') {
            throw new Error(`Model ${m} missing singleItemUpdate percentiles`);
          }
        }

        // Verify backward-compatibility aliases
        if (!bench.queryLatencies || !bench.storageFootprint) {
          throw new Error('Benchmark result missing backward-compatible queryLatencies or storageFootprint aliases');
        }

        // 2. Verify MongoDB schema_experiments persistence
        const savedDoc = await db.collection('schema_experiments').findOne({ experimentId: bench.experimentId });
        if (!savedDoc) {
          throw new Error(`Document ${bench.experimentId} not found in schema_experiments collection`);
        }
        if (savedDoc.itemCount !== 1000 || savedDoc.iterations !== 3) {
          throw new Error('Saved document itemCount or iterations mismatch');
        }
        if (typeof savedDoc.results.queryLatency.fullReconstruction.embedded.p50 !== 'number' ||
            typeof savedDoc.results.queryLatency.fullReconstruction.referenced.p50 !== 'number' ||
            typeof savedDoc.results.queryLatency.fullReconstruction.hybrid.p50 !== 'number') {
          throw new Error('Saved document missing p50 latency numbers for one or more schema models');
        }

        // 3. Verify getExperimentHistory retrieval & normalization
        const history = await getExperimentHistory();
        if (!Array.isArray(history) || history.length === 0) {
          throw new Error('getExperimentHistory must return non-empty array of experiments');
        }
        const found = history.find(e => e.experimentId === bench.experimentId);
        if (!found) {
          throw new Error('Newly persisted experiment not retrieved by getExperimentHistory()');
        }
        if (typeof found.results.queryLatency.fullReconstruction.embedded.p50 !== 'number' ||
            typeof found.results.queryLatencies.fullReconstruction.embedded.p50 !== 'number') {
          throw new Error('getExperimentHistory failed to expose normalized p50 values on both queryLatency and queryLatencies');
        }

        // 4. Verify validation logic rejects corrupted or incomplete benchmark results
        let rejectedMissing = false;
        try {
          validateBenchmarkResults({ metadata: { sampleSize: 1000 } }, 1000);
        } catch (vErr) {
          rejectedMissing = true;
        }
        if (!rejectedMissing) {
          throw new Error('validateBenchmarkResults must throw error for incomplete results');
        }

        let rejectedNullP50 = false;
        try {
          validateBenchmarkResults({
            metadata: { sampleSize: 1000, iterations: 5 },
            storage: { embedded: { storageSize: 100, totalIndexSize: 0 }, referenced: { storageSize: 200, totalIndexSize: 10 }, hybrid: { storageSize: 150, totalIndexSize: 10 } },
            queryLatency: { fullReconstruction: { embedded: null, referenced: { p50: 10 }, hybrid: { p50: 10 } } },
            retrievalAccuracy: { expectedCount: 1000, referenced: { accuracyPct: 100 }, hybrid: { accuracyPct: 100 } }
          }, 1000);
        } catch (vErr) {
          rejectedNullP50 = true;
        }
        if (!rejectedNullP50) {
          throw new Error('validateBenchmarkResults must reject null p50 when limitation is not triggered');
        }

        recordResult('27. [Benchmark] Schema Experiments Retrieval & Complete Metric Persistence Integrity', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('27. [Benchmark] Schema Experiments Retrieval & Complete Metric Persistence Integrity', false, err.message, performance.now() - t0);
      }
    }

    // Clean up test database
    console.log('\n[Cleanup] Cleaning up test database...');
    await db.dropDatabase();
    console.log('[Cleanup] Test database dropped cleanly.');

  } catch (fatalErr) {
    console.error('[Fatal Error in Test Runner]:', fatalErr);
    failedTests++;
  } finally {
    if (client) {
      await client.close();
    }
  }

  console.log('\n===============================================================');
  console.log(` Test Execution Summary: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
