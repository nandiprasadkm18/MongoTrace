"""
MongoTrace Feature Extraction Pipeline
Transforms raw cybersecurity telemetry and polymorphic BSON evidence documents
into standardized numeric feature vectors for unsupervised Isolation Forest scoring.
"""

import math
import os
import re
from typing import Dict, List, Any, Union
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
import joblib

FEATURE_NAMES = [
    "duration",
    "src_bytes",
    "dst_bytes",
    "service_port",
    "conn_count",
    "is_lotl",
    "payload_entropy",
    "off_hours_score",
    "failed_logins"
]

LOTL_BINARIES = {
    "powershell", "powershell.exe", "pwsh", "pwsh.exe",
    "certutil", "certutil.exe", "wmic", "wmic.exe",
    "vssadmin", "vssadmin.exe", "regsvr32", "regsvr32.exe",
    "rundll32", "rundll32.exe", "mshta", "mshta.exe",
    "psexec", "psexec.exe", "mimikatz", "mimikatz.exe",
    "procdump", "procdump.exe", "bitsadmin", "bitsadmin.exe",
    "netsh", "netsh.exe", "cscript", "cscript.exe", "wscript", "wscript.exe"
}

def calculate_shannon_entropy(text: str) -> float:
    """Compute Shannon entropy in bits per character (0.0 to 8.0)."""
    if not text or not isinstance(text, str):
        return 0.0
    length = len(text)
    if length <= 1:
        return 0.0
    counts = {}
    for char in text:
        counts[char] = counts.get(char, 0) + 1
    entropy = 0.0
    for count in counts.values():
        p = count / length
        entropy -= p * math.log2(p)
    return round(float(entropy), 4)

def check_is_lotl(proc_name: str, cmd_line: str) -> int:
    """Detect presence of Living-off-the-Land (LOLBAS) administrative binaries."""
    proc = str(proc_name or "").lower().strip()
    cmd = str(cmd_line or "").lower().strip()

    for binary in LOTL_BINARIES:
        if binary in proc or binary in cmd:
            return 1
    return 0

def extract_from_evidence_doc(evidence_doc: Dict[str, Any]) -> Dict[str, float]:
    """
    Extracts canonical ML features from a polymorphic MongoTrace BSON evidence document.
    Seamlessly inspects root fields, nested metadata, artifactType, and entities.
    """
    meta = evidence_doc.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}

    # 1. Duration
    duration = float(meta.get("duration") or meta.get("elapsedSec") or meta.get("durationMs", 0) / 1000.0 or 0.5)

    # 2. Bytes
    src_bytes = float(meta.get("bytesTransferred") or meta.get("bytesOut") or meta.get("srcBytes") or meta.get("fileSize") or 1024)
    dst_bytes = float(meta.get("bytesIn") or meta.get("dstBytes") or 2048)

    # 3. Port
    service_port = float(meta.get("port") or meta.get("destPort") or meta.get("destinationPort") or 443)

    # 4. Connection count
    conn_count = float(meta.get("connCount") or meta.get("requestCount") or meta.get("packetCount") or 1)

    # 5. LotL detection
    proc_name = str(meta.get("processName") or meta.get("fileName") or "")
    cmd_line = str(meta.get("commandLine") or evidence_doc.get("description") or "")
    is_lotl = float(check_is_lotl(proc_name, cmd_line))

    # 6. Payload entropy (from command line, hash, payload, or file content)
    entropy_sample = cmd_line or str(meta.get("filePath") or meta.get("sha256") or "")
    entropy = calculate_shannon_entropy(entropy_sample)
    if entropy == 0.0:
        entropy = 3.2  # default benign entropy

    # 7. Off-hours score
    ts_val = evidence_doc.get("timestamp") or evidence_doc.get("eventTimestamp")
    off_hours = 0.2
    if ts_val:
        try:
            ts_str = str(ts_val)
            # Try to extract hour
            match = re.search(r"T(\d{2}):", ts_str)
            if match:
                hour = int(match.group(1))
                off_hours = 0.85 if (hour < 7 or hour > 19) else 0.15
        except Exception:
            pass

    # 8. Failed logins
    failed_logins = float(meta.get("failedLogins") or meta.get("failedCount") or 0)
    if "failed" in str(evidence_doc.get("title", "")).lower():
        failed_logins = max(failed_logins, 1.0)

    return {
        "duration": duration,
        "src_bytes": src_bytes,
        "dst_bytes": dst_bytes,
        "service_port": service_port,
        "conn_count": conn_count,
        "is_lotl": is_lotl,
        "payload_entropy": entropy,
        "off_hours_score": off_hours,
        "failed_logins": failed_logins
    }

class TelemetryFeaturePipeline:
    """Standardizes and scales telemetry features for ML inference."""

    def __init__(self):
        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(self, df: pd.DataFrame) -> "TelemetryFeaturePipeline":
        """Fit StandardScaler on the 9 numeric telemetry features."""
        X = df[FEATURE_NAMES].values
        self.scaler.fit(X)
        self.is_fitted = True
        return self

    def transform(self, df: Union[pd.DataFrame, List[Dict[str, Any]]]) -> np.ndarray:
        """Transform features using fitted scaler."""
        if not self.is_fitted:
            raise ValueError("FeaturePipeline must be fitted before transforming.")

        if isinstance(df, list):
            df = pd.DataFrame(df)

        # Ensure all columns present
        for col in FEATURE_NAMES:
            if col not in df.columns:
                df[col] = 0.0

        X = df[FEATURE_NAMES].values
        return self.scaler.transform(X)

    def fit_transform(self, df: pd.DataFrame) -> np.ndarray:
        self.fit(df)
        return self.transform(df)

    def save(self, filepath: str):
        """Persist fitted scaler to disk."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({"scaler": self.scaler, "feature_names": FEATURE_NAMES}, filepath)

    @classmethod
    def load(cls, filepath: str) -> "TelemetryFeaturePipeline":
        """Load fitted pipeline from disk."""
        data = joblib.load(filepath)
        instance = cls()
        instance.scaler = data["scaler"]
        instance.is_fitted = True
        return instance

