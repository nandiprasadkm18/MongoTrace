with open('tests/run_tests.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
target_import = """  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch
} = require('../services/mlService');"""

new_import = """  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch,
  recordMLDetection,
  getMLDetections,
  getMLStats,
  evaluateInvestigationWithML
} = require('../services/mlService');"""

assert target_import in content, "target_import not found"
content = content.replace(target_import, new_import, 1)

# 2. Add Test 25 after Test 24
test24_end = "recordResult('24. [ML] Ingestion Pipeline with Integrated ML Scoring Persistence', true, null, performance.now() - t0);\n      } catch (err) {\n        recordResult('24. [ML] Ingestion Pipeline with Integrated ML Scoring Persistence', false, err.message, performance.now() - t0);\n      }\n    }"

if test24_end not in content:
    test24_end = "recordResult('24. [ML] Ingestion Pipeline with Integrated ML Scoring Persistence', true, null, performance.now() - t0);\r\n      } catch (err) {\r\n        recordResult('24. [ML] Ingestion Pipeline with Integrated ML Scoring Persistence', false, err.message, performance.now() - t0);\r\n      }\r\n    }"

assert test24_end in content, "test24_end not found"

test25_code = """

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
    }"""

content = content.replace(test24_end, test24_end + test25_code, 1)

with open('tests/run_tests.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated tests/run_tests.js with Test 25 successfully!")

