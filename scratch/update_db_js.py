with open('services/db.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """    // Schema benchmark collections indexes
    await db.collection('schema_bench_referenced_cases').createIndex({ caseId: 1 }, { unique: true });"""

replacement = """    // 11. ML Detections collection (Isolation Forest Anomaly Findings)
    await db.collection('ml_detections').createIndex({ detectionId: 1 }, { unique: true });
    await db.collection('ml_detections').createIndex({ evidenceId: 1 });
    await db.collection('ml_detections').createIndex({ investigationId: 1, anomalyScore: -1 });
    await db.collection('ml_detections').createIndex({ caseId: 1, anomalyScore: -1 });
    await db.collection('ml_detections').createIndex({ isAnomaly: 1, detectedAt: -1 });
    await db.collection('ml_detections').createIndex({ threatLevel: 1, detectedAt: -1 });
    await db.collection('ml_detections').createIndex({ detectedAt: -1 });

    // Schema benchmark collections indexes
    await db.collection('schema_bench_referenced_cases').createIndex({ caseId: 1 }, { unique: true });"""

if target in content:
    content = content.replace(target, replacement, 1)
    # Also update verifiedCollections count from 11 to 12
    content = content.replace("{ verifiedCollections: 11 }", "{ verifiedCollections: 12 }")
    with open('services/db.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated services/db.js successfully!")
else:
    print("Target not found in services/db.js!")

