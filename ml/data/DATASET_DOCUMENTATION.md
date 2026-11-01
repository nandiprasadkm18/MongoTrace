# MongoTrace Cybersecurity Telemetry Benchmark Dataset

## 1. Overview & Societal Problem
Modern enterprise security teams face alert fatigue caused by millions of daily telemetry events. Sophisticated nation-state adversaries (APTs), double-extortion ransomware gangs, and malicious insiders bypass signature-based intrusion detection by utilizing Living-off-the-Land (LOLBAS) binaries, encrypted command-and-control (C2) channels, and off-hours exfiltration. 

This dataset provides statistically grounded, multi-vector cybersecurity telemetry for training unsupervised machine learning anomaly detection models (specifically **Isolation Forest**), addressing the societal need for automated zero-day detection in digital forensics and evidence intelligence.

---

## 2. Benchmark Lineage & Academic Citations
The feature schema and statistical distributions are derived from established academic cybersecurity intrusion benchmarks:

1. **UNSW-NB15 Benchmark Dataset:**
   * *Institution:* Cyber Range Lab of the Australian Centre for Cyber Security (ACCS).
   * *Citation:* Moustafa, Nour, and Jill Slay. *"UNSW-NB15: a comprehensive data set for network intrusion detection systems (UNSW-NB15 network data set)."* 2015 Military Communications and Information Systems Conference (MilCIS). IEEE, 2015.
   * *Relevance:* Models connection duration, source/destination bytes, packet frequencies, and service port distributions.

2. **NSL-KDD Dataset:**
   * *Institution:* University of New Brunswick (UNB) Information Security Centre of Excellence.
   * *Citation:* Tavallaee, Mahbod, et al. *"A detailed analysis of the KDD CUP 99 data set."* 2009 IEEE Symposium on Computational Intelligence for Security and Defense Applications (CISDA). IEEE, 2009.
   * *Relevance:* Models failed authentication attempts, connection frequency to same service, and service type risk factors.

3. **MITRE ATT&CK Framework v14:**
   * *Tactics Modeled:* Initial Access (T1078), Execution (T1059), Defense Evasion (T1218, T1036), Credential Access (T1110), Exfiltration (T1048), Impact (T1486, T1490).

---

## 3. Feature Definitions (9 Features)

| Feature Name | Data Type | Units / Scale | Forensic Purpose |
| :--- | :--- | :--- | :--- |
| `duration` | Float | Seconds ($0.01 - 300.0$) | Distinguishes brief probe pings from sustained exfiltration streams or process execution lengths. |
| `src_bytes` | Integer | Bytes ($64 - 45,000,000$) | Unusually high outbound bytes indicate mass data exfiltration (Project Chimera / BlackCat). |
| `dst_bytes` | Integer | Bytes ($64 - 1,000,000$) | High inbound bytes indicate staging or secondary payload staging. |
| `service_port` | Integer | TCP/UDP Port ($1 - 65535$) | Distinguishes standard ports (443, 80, 53) from suspicious C2 ports (4444, 8443, 9001). |
| `conn_count` | Integer | Count per window | High connection bursts indicate automated beaconing or port scanning. |
| `is_lotl` | Binary | 0 or 1 | Flags execution of dual-use administrative binaries (PowerShell, CertUtil, WMIC, vssadmin). |
| `payload_entropy` | Float | Shannon Bits ($0.0 - 8.0$) | High entropy ($\ge 7.0$) flags encrypted archives, base64 obfuscation, or ransomware ciphertext. |
| `off_hours_score` | Float | Score ($0.1 - 1.0$) | High score indicates anomalous temporal execution outside standard business hours (00:00–05:00). |
| `failed_logins` | Integer | Attempt count ($0 - 85$) | Identifies credential brute-forcing and password-spraying attacks. |

---

## 4. Dataset Partitions & Balance

### Training Set (`cybersecurity_telemetry_train.csv`)
* **Total Instances:** 5,000
* **Normal / Benign Telemetry:** 4,400 (88.0%)
* **Anomalous Telemetry:** 600 (12.0% contamination)

### Validation Set (`cybersecurity_telemetry_val.csv`)
* **Total Instances:** 1,500
* **Normal / Benign Telemetry:** 1,275 (85.0%)
* **Anomalous Telemetry:** 225 (15.0% contamination)

### Threat Vectors Represented in Anomalies:
1. **Mass Data Exfiltration:** High `src_bytes`, high `payload_entropy`, high `off_hours_score`.
2. **Command & Control (C2) Beaconing:** Non-standard `service_port` (4444, 8443), rapid `conn_count`, low duration.
3. **Living-off-the-Land (LotL) Execution:** `is_lotl = 1`, high command entropy, execution via administrative tools.
4. **Credential Brute-Force:** High `failed_logins`, connection spikes on ports 22, 3389, 445.
5. **Ransomware Encryption Bursts:** High `conn_count`, extreme `payload_entropy` ($\ge 7.6$), shadow copy deletion indicators.

