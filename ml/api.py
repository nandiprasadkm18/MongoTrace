"""
MongoTrace Machine Learning FastAPI Prediction Microservice
Serves trained Isolation Forest model for real-time cyber telemetry anomaly scoring,
feature attribution, and explainable forensics inference.
"""

import os
import time
import json
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib

from .feature_extractor import (
    TelemetryFeaturePipeline,
    extract_from_evidence_doc,
    FEATURE_NAMES
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "isolation_forest.joblib")
SCALER_PATH = os.path.join(MODELS_DIR, "feature_scaler.joblib")
REPORT_PATH = os.path.join(MODELS_DIR, "evaluation_report.json")

app = FastAPI(
    title="MongoTrace ML Anomaly Detection Engine",
    description="Dedicated unsupervised Isolation Forest microservice for digital forensics telemetry.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
feature_pipeline = None
eval_report = {}
START_TIME = time.time()

def load_artifacts():
    global model, feature_pipeline, eval_report
    if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
        raise FileNotFoundError("Model artifacts missing. Run ml/train.py first.")

    model = joblib.load(MODEL_PATH)
    feature_pipeline = TelemetryFeaturePipeline.load(SCALER_PATH)

    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, "r", encoding="utf-8") as f:
            eval_report = json.load(f)

try:
    load_artifacts()
    print("[MongoTrace ML API] Isolation Forest & Scaler successfully loaded into memory.")
except Exception as e:
    print(f"[MongoTrace ML API] Warning during artifact load: {e}")

class EvidenceInput(BaseModel):
    evidenceId: Optional[str] = None
    investigationId: Optional[str] = None
    caseId: Optional[str] = None
    title: Optional[str] = "Forensic Event"
    artifactType: Optional[str] = "SECURITY_EVENT"
    severity: Optional[str] = "MEDIUM"
    sourceHost: Optional[str] = "unknown-host"
    timestamp: Optional[Any] = None
    description: Optional[str] = ""
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    entities: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

class BatchEvidenceInput(BaseModel):
    items: List[EvidenceInput]

class PredictionResponse(BaseModel):
    is_anomaly: bool
    anomaly_score: float
    threat_level: str
    confidence: float
    decision_score: float
    features_extracted: Dict[str, float]
    top_contributing_features: List[Dict[str, Any]]
    explanation: str
    evidence_id: Optional[str] = None

def compute_explanation(raw_features: Dict[str, float], scaled_vector: np.ndarray, is_anomaly: bool, score: float) -> tuple:
    contributions = []

    for idx, name in enumerate(FEATURE_NAMES):
        z_score = float(scaled_vector[0][idx])
        abs_z = abs(z_score)
        contributions.append({
            "feature": name,
            "raw_value": raw_features[name],
            "z_score": round(z_score, 2),
            "deviation_weight": round(abs_z, 2)
        })

    contributions.sort(key=lambda x: x["deviation_weight"], reverse=True)
    top_contributors = contributions[:3]

    if is_anomaly:
        reasons = []
        for c in top_contributors:
            feat = c["feature"]
            val = c["raw_value"]
            if feat == "is_lotl" and val == 1.0:
                reasons.append("Invocation of native dual-use administrative binary (LOLBAS)")
            elif feat == "src_bytes" and val > 100000:
                reasons.append(f"Anomalous high-volume outbound byte transfer ({int(val):,} bytes)")
            elif feat == "payload_entropy" and val > 5.5:
                reasons.append(f"Elevated payload Shannon entropy ({val:.2f} bits, encrypted/obfuscated content)")
            elif feat == "off_hours_score" and val > 0.7:
                reasons.append("Execution during non-standard off-hours window (00:00–05:00)")
            elif feat == "service_port" and val in [4444, 8443, 9001, 1337]:
                reasons.append(f"Anomalous service port binding (TCP/{int(val)})")
            elif feat == "conn_count" and val > 30:
                reasons.append(f"High-frequency connection burst ({int(val)} connections)")
            elif feat == "failed_logins" and val > 5:
                reasons.append(f"Multiple preceding authentication failures ({int(val)} failed attempts)")
            elif feat == "duration" and val > 60:
                reasons.append(f"Prolonged session execution duration ({val:.1f}s)")

        if reasons:
            explanation = "; ".join(reasons) + "."
        else:
            explanation = "Multivariate spatial deviation across combined host/network telemetry."
    else:
        explanation = "Telemetry conforms to normal enterprise operational baseline."

    return top_contributors, explanation

def predict_single_doc(doc_dict: Dict[str, Any]) -> PredictionResponse:
    if model is None or feature_pipeline is None:
        raise HTTPException(status_code=503, detail="ML model is not loaded. Train model first.")

    features = extract_from_evidence_doc(doc_dict)
    scaled_X = feature_pipeline.transform([features])

    raw_pred = int(model.predict(scaled_X)[0])  # -1 = anomaly, +1 = normal
    is_anomaly = bool(raw_pred == -1)

    dec_func = float(model.decision_function(scaled_X)[0])
    # Normalized score 0.00 to 1.00 via sigmoid
    anomaly_score = float(1.0 / (1.0 + np.exp(dec_func * 5.0)))

    if anomaly_score >= 0.80:
        threat_level = "CRITICAL"
    elif anomaly_score >= 0.60:
        threat_level = "HIGH"
    elif anomaly_score >= 0.45:
        threat_level = "MEDIUM"
    else:
        threat_level = "LOW"

    confidence = float(min(1.0, 0.5 + abs(anomaly_score - 0.5) * 1.2))
    top_contributors, explanation = compute_explanation(features, scaled_X, is_anomaly, anomaly_score)

    return PredictionResponse(
        is_anomaly=is_anomaly,
        anomaly_score=round(anomaly_score, 4),
        threat_level=threat_level,
        confidence=round(confidence, 4),
        decision_score=round(dec_func, 4),
        features_extracted=features,
        top_contributing_features=top_contributors,
        explanation=explanation,
        evidence_id=doc_dict.get("evidenceId")
    )

@app.get("/health")
def health():
    return {
        "status": "ONLINE",
        "service": "MongoTrace-ML-Engine",
        "model_loaded": model is not None,
        "scaler_loaded": feature_pipeline is not None,
        "features": FEATURE_NAMES,
        "uptime_seconds": round(time.time() - START_TIME, 2)
    }

@app.get("/model-info")
def model_info():
    if not eval_report:
        raise HTTPException(status_code=404, detail="Model evaluation report not found.")
    return {
        "success": True,
        "model_type": eval_report.get("model_type"),
        "algorithm": eval_report.get("algorithm"),
        "features": FEATURE_NAMES,
        "hyperparameters": eval_report.get("hyperparameters"),
        "metrics": eval_report.get("evaluation_metrics"),
        "validation_samples": eval_report.get("validation_samples")
    }

@app.post("/predict", response_model=PredictionResponse)
def predict(evidence: EvidenceInput):
    doc_dict = evidence.model_dump()
    return predict_single_doc(doc_dict)

@app.post("/predict-batch")
def predict_batch(batch: BatchEvidenceInput):
    results = [predict_single_doc(item.model_dump()) for item in batch.items]
    anomalies_count = sum(1 for r in results if r.is_anomaly)
    return {
        "success": True,
        "total_evaluated": len(results),
        "anomalies_detected": anomalies_count,
        "normal_count": len(results) - anomalies_count,
        "results": results
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ml.api:app", host="0.0.0.0", port=5055, reload=False)
