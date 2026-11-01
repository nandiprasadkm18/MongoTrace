with open('services/evidenceService.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
target_import = "const { scoreEvidenceItem } = require('./mlService');"
replacement_import = "const { scoreEvidenceItem, recordMLDetection } = require('./mlService');"
assert target_import in content, "target_import not found"
content = content.replace(target_import, replacement_import, 1)

# 2. Fix the mlAnomalyScore / mlIsAnomaly duplication
target_fields = """    mlAnomalyScore: evidenceData.mlAnomalyScore !== undefined ? evidenceData.mlAnomalyScore : (mlPrediction ? mlPrediction.anomaly_score : null),
    mlIsAnomaly: evidenceData.mlIsAnomaly !== undefined ? Boolean(evidenceData.mlIsAnomaly) : (mlPrediction ? mlPrediction.is_anomaly : false),
    mlThreatLevel: evidenceData.mlThreatLevel || (mlPrediction ? mlPrediction.threat_level : 'LOW'),
    mlExplanation: evidenceData.mlExplanation || (mlPrediction ? mlPrediction.explanation : null),
    mlIsAnomaly: Boolean(evidenceData.mlIsAnomaly),
    mlThreatLevel: evidenceData.mlThreatLevel || 'LOW',
    mlExplanation: evidenceData.mlExplanation || null,"""

replacement_fields = """    mlAnomalyScore: evidenceData.mlAnomalyScore !== undefined ? evidenceData.mlAnomalyScore : (mlPrediction ? mlPrediction.anomaly_score : null),
    mlIsAnomaly: evidenceData.mlIsAnomaly !== undefined ? Boolean(evidenceData.mlIsAnomaly) : (mlPrediction ? Boolean(mlPrediction.is_anomaly) : false),
    mlThreatLevel: evidenceData.mlThreatLevel || (mlPrediction ? mlPrediction.threat_level : 'LOW'),
    mlExplanation: evidenceData.mlExplanation || (mlPrediction ? mlPrediction.explanation : null),"""

assert target_fields in content, "target_fields not found"
content = content.replace(target_fields, replacement_fields, 1)

# 3. Add recordMLDetection call before dbEvents.emit('EVIDENCE_CREATED', newDoc);
target_emit = "  dbEvents.emit('EVIDENCE_CREATED', newDoc);"
replacement_emit = """  // Record in ml_detections collection if scored
  if (mlPrediction || evidenceData.mlAnomalyScore !== undefined) {
    const scoreInfo = mlPrediction || {
      anomaly_score: newDoc.mlAnomalyScore,
      is_anomaly: newDoc.mlIsAnomaly,
      threat_level: newDoc.mlThreatLevel,
      explanation: newDoc.mlExplanation,
      confidence: 0.8
    };
    recordMLDetection(scoreInfo, newDoc).catch(err => {
      console.warn('[Evidence ML] Detection persistence note:', err.message);
    });
  }

  dbEvents.emit('EVIDENCE_CREATED', newDoc);"""

assert target_emit in content, "target_emit not found"
content = content.replace(target_emit, replacement_emit, 1)

with open('services/evidenceService.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated services/evidenceService.js successfully!")

