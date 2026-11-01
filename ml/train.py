"""
MongoTrace Isolation Forest Anomaly Detection Trainer & Evaluator
Trains unsupervised Isolation Forest on scaled cybersecurity telemetry,
evaluates performance on validation benchmark, and exports production model artifacts.
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    classification_report
)
import joblib

from .dataset_loader import load_train_data, load_validation_data
from .feature_extractor import TelemetryFeaturePipeline, FEATURE_NAMES

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

def train_and_evaluate():
    print("=================================================================")
    print(" MongoTrace Isolation Forest Model Training & Evaluation")
    print("=================================================================\n")

    # 1. Load Data
    print("[1/5] Loading training (5,000) and validation (1,500) datasets...")
    train_df, X_train, y_train = load_train_data()
    val_df, X_val, y_val = load_validation_data()

    # 2. Fit Feature Pipeline (Scaler)
    print("[2/5] Fitting Feature Transformation Pipeline on 9 telemetry features...")
    pipeline = TelemetryFeaturePipeline()
    X_train_scaled = pipeline.fit_transform(train_df)
    X_val_scaled = pipeline.transform(val_df)

    scaler_path = os.path.join(MODELS_DIR, "feature_scaler.joblib")
    pipeline.save(scaler_path)
    print(f"      Saved fitted scaler to: {scaler_path}")

    # 3. Train Unsupervised Isolation Forest
    # Contamination set to 0.12 (matching expected cybersecurity anomaly ratio)
    print("[3/5] Training Isolation Forest (n_estimators=150, contamination=0.12)...")
    iso_forest = IsolationForest(
        n_estimators=150,
        max_samples="auto",
        contamination=0.12,
        max_features=1.0,
        bootstrap=False,
        n_jobs=-1,
        random_state=42
    )

    iso_forest.fit(X_train_scaled)

    # 4. Evaluate on Held-out Validation Dataset
    print("[4/5] Evaluating model on validation partition (1,500 instances)...")
    # Isolation Forest: -1 for outlier/anomaly, +1 for inlier/normal
    raw_preds = iso_forest.predict(X_val_scaled)
    y_pred = np.where(raw_preds == -1, 1, 0)

    # Raw decision function: lower means more anomalous
    dec_func = iso_forest.decision_function(X_val_scaled)
    # Normalized anomaly score: 0.0 (normal) to 1.0 (extreme anomaly)
    # Uses calibrated sigmoid of decision function
    anomaly_scores = 1.0 / (1.0 + np.exp(dec_func * 4.0))

    acc = float(accuracy_score(y_val, y_pred))
    prec = float(precision_score(y_val, y_pred, zero_division=0))
    rec = float(recall_score(y_val, y_pred, zero_division=0))
    f1 = float(f1_score(y_val, y_pred, zero_division=0))
    roc_auc = float(roc_auc_score(y_val, anomaly_scores))
    cm = confusion_matrix(y_val, y_pred).tolist()

    print(f"\n--- Model Evaluation Results (Validation Set) ---")
    print(f"  * Accuracy:        {acc:.4f} ({acc*100:.2f}%)")
    print(f"  * Precision:       {prec:.4f} ({prec*100:.2f}%)")
    print(f"  * Recall:          {rec:.4f} ({rec*100:.2f}%)")
    print(f"  * F1-Score:        {f1:.4f}")
    print(f"  * ROC-AUC Score:   {roc_auc:.4f}")
    print(f"  * Confusion Matrix:")
    print(f"      [TN: {cm[0][0]:>4}, FP: {cm[0][1]:>4}] (True Benign: {y_val.shape[0] - y_val.sum()})")
    print(f"      [FN: {cm[1][0]:>4}, TP: {cm[1][1]:>4}] (True Anomalies: {y_val.sum()})")

    # Per-attack category detection breakdown
    val_df["pred_label"] = y_pred
    val_df["anomaly_score"] = anomaly_scores
    print(f"\n--- Detection Rate by Attack Category ---")
    for atk in val_df["attack_category"].unique():
        sub = val_df[val_df["attack_category"] == atk]
        detected = (sub["pred_label"] == 1).sum() if atk != "Normal" else (sub["pred_label"] == 0).sum()
        total = len(sub)
        metric_name = "Accuracy" if atk == "Normal" else "Recall"
        print(f"  * {atk:<24}: {detected:>4}/{total:>4} {metric_name}: {detected/total:.2%}")

    # 5. Persist Model Artifacts and Evaluation Report
    print(f"\n[5/5] Exporting model artifact & audit metrics...")
    model_path = os.path.join(MODELS_DIR, "isolation_forest.joblib")
    joblib.dump(iso_forest, model_path)
    print(f"      Model artifact saved to: {model_path}")

    report = {
        "model_type": "IsolationForest",
        "algorithm": "sklearn.ensemble.IsolationForest",
        "hyperparameters": {
            "n_estimators": 150,
            "max_samples": "auto",
            "contamination": 0.12,
            "random_state": 42
        },
        "feature_count": len(FEATURE_NAMES),
        "features": FEATURE_NAMES,
        "evaluation_metrics": {
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "roc_auc": round(roc_auc, 4),
            "confusion_matrix": {
                "true_negatives": cm[0][0],
                "false_positives": cm[0][1],
                "false_negatives": cm[1][0],
                "true_positives": cm[1][1]
            }
        },
        "validation_samples": len(val_df),
        "created_at": pd.Timestamp.now().isoformat()
    }

    report_path = os.path.join(MODELS_DIR, "evaluation_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"      Evaluation report saved to: {report_path}")

    print("\nTraining & Evaluation Pipeline Finished Successfully.")
    return report

if __name__ == "__main__":
    train_and_evaluate()

