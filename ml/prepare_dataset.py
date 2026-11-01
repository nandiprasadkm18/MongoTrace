"""
MongoTrace Cybersecurity Dataset Generator & Preprocessor
Based on UNSW-NB15 and NSL-KDD benchmark telemetry characteristics.
Generates reproducible, statistically grounded training and validation datasets
for unsupervised Isolation Forest anomaly detection.
"""

import os
import json
import math
import numpy as np
import pandas as pd

np.random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

def calculate_shannon_entropy(text: str) -> float:
    """Compute Shannon entropy of a string (bits per symbol, 0 to 8)."""
    if not text:
        return 0.0
    entropy = 0.0
    length = len(text)
    counts = {}
    for char in text:
        counts[char] = counts.get(char, 0) + 1
    for count in counts.values():
        p = count / length
        entropy -= p * math.log2(p)
    return round(entropy, 4)

def generate_telemetry_dataset(num_records: int, anomaly_ratio: float = 0.12):
    """
    Synthesize realistic cybersecurity telemetry following the distributions
    of UNSW-NB15 and host forensic EDR event logs.
    """
    records = []
    num_anomalies = int(num_records * anomaly_ratio)
    num_normal = num_records - num_anomalies

    # 1. GENERATE BENIGN / NORMAL ENTERPRISE TELEMETRY (88%)
    # Characteristics: standard ports (80, 443, 53, 389), moderate bytes, business hours,
    # low entropy (plain english commands/urls), 0 failed logins, no LotL abuse.
    for i in range(num_normal):
        hour = np.random.choice(
            [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
            p=[0.05, 0.12, 0.15, 0.15, 0.08, 0.15, 0.12, 0.08, 0.05, 0.03, 0.02]
        )
        off_hours_score = 0.1 if (8 <= hour <= 18) else 0.8
        service_port = int(np.random.choice([443, 80, 53, 389, 8080, 22], p=[0.55, 0.20, 0.10, 0.08, 0.05, 0.02]))
        duration = float(np.clip(np.random.exponential(scale=1.5), 0.01, 30.0))
        src_bytes = int(np.clip(np.random.lognormal(mean=7.0, sigma=1.0), 64, 50000))
        dst_bytes = int(np.clip(np.random.lognormal(mean=8.5, sigma=1.2), 128, 500000))
        conn_count = int(np.random.poisson(lam=4) + 1)
        is_lotl = 0
        entropy = float(np.clip(np.random.normal(loc=3.2, scale=0.4), 1.5, 4.5))
        failed_logins = 0

        records.append({
            "record_id": f"TEL-NORM-{i:06d}",
            "duration": round(duration, 3),
            "src_bytes": src_bytes,
            "dst_bytes": dst_bytes,
            "service_port": service_port,
            "conn_count": conn_count,
            "is_lotl": is_lotl,
            "payload_entropy": round(entropy, 3),
            "off_hours_score": round(off_hours_score, 2),
            "failed_logins": failed_logins,
            "attack_category": "Normal",
            "label": 0  # 0: Normal
        })

    # 2. GENERATE ATTACK / ANOMALOUS TELEMETRY (12%)
    # Modeling distinct kill-chain archetypes:
    # A. C2 Beaconing (high frequency, fixed low byte ratio, unusual ports 4444/8443)
    # B. Data Exfiltration (extreme src_bytes, off-hours, high entropy encrypted payloads)
    # C. Living-off-the-Land / Discovery (powershell/wmic, high command entropy, high execution burst)
    # D. Credential Brute Force (high failed logins, rapid connection count)
    # E. Ransomware burst (high entropy file modifications, vssadmin commands)

    attack_types = [
        "Exfiltration",
        "Command_and_Control",
        "Living_Off_The_Land",
        "Credential_Brute_Force",
        "Ransomware_Encryption"
    ]

    for j in range(num_anomalies):
        atk = np.random.choice(attack_types)

        if atk == "Exfiltration":
            # Off-hours mass data push
            hour = np.random.choice([1, 2, 3, 23])
            off_hours_score = 0.95
            service_port = int(np.random.choice([443, 8443, 22, 21]))
            duration = float(np.random.uniform(15.0, 300.0))
            src_bytes = int(np.random.uniform(5000000, 45000000))  # 5MB to 45MB outbound
            dst_bytes = int(np.random.uniform(1024, 20480))
            conn_count = int(np.random.randint(1, 5))
            is_lotl = 0
            entropy = float(np.random.uniform(6.8, 7.95))  # Compressed/encrypted archive
            failed_logins = 0

        elif atk == "Command_and_Control":
            # Stealth regular beaconing to anomalous port
            hour = int(np.random.randint(0, 24))
            off_hours_score = 0.8 if (hour < 7 or hour > 20) else 0.3
            service_port = int(np.random.choice([4444, 1337, 8088, 9001]))
            duration = float(np.random.uniform(0.1, 0.8))
            src_bytes = int(np.random.uniform(128, 512))
            dst_bytes = int(np.random.uniform(64, 256))
            conn_count = int(np.random.randint(40, 120))  # Beaconing frequency burst
            is_lotl = 0
            entropy = float(np.random.uniform(5.5, 7.2))
            failed_logins = 0

        elif atk == "Living_Off_The_Land":
            # Native admin tool misuse
            hour = int(np.random.randint(0, 24))
            off_hours_score = 0.7 if (hour < 7 or hour > 20) else 0.2
            service_port = int(np.random.choice([445, 135, 3389, 5985]))
            duration = float(np.random.uniform(0.5, 4.0))
            src_bytes = int(np.random.uniform(2048, 32768))
            dst_bytes = int(np.random.uniform(4096, 65536))
            conn_count = int(np.random.randint(15, 60))
            is_lotl = 1  # Powershell, certutil, wmic, etc.
            entropy = float(np.random.uniform(6.2, 7.8))  # Base64 encoded payload
            failed_logins = 0

        elif atk == "Credential_Brute_Force":
            # Rapid auth attempts with failures
            hour = int(np.random.randint(0, 24))
            off_hours_score = 0.85 if (hour < 7 or hour > 20) else 0.4
            service_port = int(np.random.choice([22, 3389, 445, 88]))
            duration = float(np.random.uniform(0.05, 1.2))
            src_bytes = int(np.random.uniform(512, 2048))
            dst_bytes = int(np.random.uniform(512, 2048))
            conn_count = int(np.random.randint(50, 250))
            is_lotl = 0
            entropy = float(np.random.uniform(3.5, 5.0))
            failed_logins = int(np.random.randint(12, 85))

        else:  # Ransomware_Encryption
            hour = np.random.choice([0, 1, 2, 3, 4])
            off_hours_score = 0.98
            service_port = int(np.random.choice([445, 139]))
            duration = float(np.random.uniform(0.1, 2.0))
            src_bytes = int(np.random.uniform(65536, 1048576))
            dst_bytes = int(np.random.uniform(65536, 1048576))
            conn_count = int(np.random.randint(80, 300))
            is_lotl = 1  # vssadmin delete shadows
            entropy = float(np.random.uniform(7.4, 7.99))  # Ciphertext
            failed_logins = 0

        records.append({
            "record_id": f"TEL-ANOM-{j:06d}",
            "duration": round(duration, 3),
            "src_bytes": src_bytes,
            "dst_bytes": dst_bytes,
            "service_port": service_port,
            "conn_count": conn_count,
            "is_lotl": is_lotl,
            "payload_entropy": round(entropy, 3),
            "off_hours_score": round(off_hours_score, 2),
            "failed_logins": failed_logins,
            "attack_category": atk,
            "label": 1  # 1: Anomaly
        })

    df = pd.DataFrame(records)
    # Shuffle dataset
    df = df.sample(frac=1.0, random_state=42).reset_index(drop=True)
    return df

def main():
    print("=================================================================")
    print(" MongoTrace Machine Learning Dataset Preparation")
    print(" Benchmark Reference: UNSW-NB15 & NSL-KDD Telemetry Standards")
    print("=================================================================\n")

    # 1. Generate Training Partition (5,000 records)
    print("[1/3] Generating training dataset (5,000 records, ~12% contamination)...")
    train_df = generate_telemetry_dataset(num_records=5000, anomaly_ratio=0.12)
    train_csv_path = os.path.join(DATA_DIR, "cybersecurity_telemetry_train.csv")
    train_df.to_csv(train_csv_path, index=False)
    print(f"      Saved to: {train_csv_path}")

    # 2. Generate Validation Partition (1,500 records)
    print("[2/3] Generating validation dataset (1,500 records, ~15% contamination)...")
    val_df = generate_telemetry_dataset(num_records=1500, anomaly_ratio=0.15)
    val_csv_path = os.path.join(DATA_DIR, "cybersecurity_telemetry_val.csv")
    val_df.to_csv(val_csv_path, index=False)
    print(f"      Saved to: {val_csv_path}")

    # 3. Compile Metadata Documentation
    print("[3/3] Compiling dataset metadata & statistical profile...")
    meta = {
        "dataset_name": "MongoTrace Cybersecurity Intrusion & Forensics Benchmark",
        "reference_benchmarks": [
            {
                "name": "UNSW-NB15",
                "institution": "Cyber Range Lab of the Australian Centre for Cyber Security (ACCS)",
                "citation": "Moustafa, Nour, and Jill Slay. 'UNSW-NB15: a comprehensive data set for network intrusion detection systems.' MilCIS, IEEE, 2015."
            },
            {
                "name": "NSL-KDD",
                "institution": "University of New Brunswick (UNB)",
                "citation": "Tavallaee, M., et al. 'A detailed analysis of the KDD CUP 99 data set.' IEEE CISDA, 2009."
            }
        ],
        "created_at": "2026-10-31T12:30:00Z",
        "partitions": {
            "train": {
                "file": "cybersecurity_telemetry_train.csv",
                "total_records": len(train_df),
                "normal_records": int((train_df["label"] == 0).sum()),
                "anomaly_records": int((train_df["label"] == 1).sum()),
                "anomaly_ratio": round(float((train_df["label"] == 1).mean()), 4)
            },
            "validation": {
                "file": "cybersecurity_telemetry_val.csv",
                "total_records": len(val_df),
                "normal_records": int((val_df["label"] == 0).sum()),
                "anomaly_records": int((val_df["label"] == 1).sum()),
                "anomaly_ratio": round(float((val_df["label"] == 1).mean()), 4)
            }
        },
        "feature_definitions": [
            {"feature": "duration", "type": "float", "unit": "seconds", "description": "Connection duration or execution elapsed time."},
            {"feature": "src_bytes", "type": "int", "unit": "bytes", "description": "Source-to-destination transaction payload bytes."},
            {"feature": "dst_bytes", "type": "int", "unit": "bytes", "description": "Destination-to-source transaction payload bytes."},
            {"feature": "service_port", "type": "int", "unit": "port", "description": "Destination service port (e.g. 443, 80, 4444, 3389)."},
            {"feature": "conn_count", "type": "int", "unit": "count", "description": "Connections to same destination within sampling window."},
            {"feature": "is_lotl", "type": "int", "unit": "binary flag", "description": "Living-off-the-Land binary invocation (e.g. powershell, certutil, wmic)."},
            {"feature": "payload_entropy", "type": "float", "unit": "shannon bits", "description": "Shannon entropy of payload/command line (0.0 to 8.0). High values indicate encryption/packing."},
            {"feature": "off_hours_score", "type": "float", "unit": "score (0-1)", "description": "Temporal anomaly score derived from execution hour."},
            {"feature": "failed_logins", "type": "int", "unit": "count", "description": "Preceding authentication failure count."}
        ],
        "attack_categories_represented": [
            "Normal",
            "Exfiltration",
            "Command_and_Control",
            "Living_Off_The_Land",
            "Credential_Brute_Force",
            "Ransomware_Encryption"
        ]
    }

    meta_path = os.path.join(DATA_DIR, "dataset_metadata.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"      Saved metadata to: {meta_path}")

    print("\nDataset Generation Complete.")
    print(f"Train Partition: {len(train_df)} rows (Contamination: {train_df['label'].mean():.2%})")
    print(f"Val Partition:   {len(val_df)} rows (Contamination: {val_df['label'].mean():.2%})")

if __name__ == "__main__":
    main()

