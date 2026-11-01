with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update mlService imports
old_import = """const {
  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch
} = require('./services/mlService');"""

new_import = """const {
  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch,
  recordMLDetection,
  getMLDetections,
  getMLStats,
  evaluateInvestigationWithML
} = require('./services/mlService');"""

if old_import in content:
    content = content.replace(old_import, new_import, 1)

# 2. Add ml_detections to ALLOWED_QUERY_COLLECTIONS
target_coll = "'derived_findings',"
replacement_coll = "'derived_findings',\n  'ml_detections',"
if "'ml_detections'" not in content and target_coll in content:
    content = content.replace(target_coll, replacement_coll, 1)

# 3. Replace ML routes block
start_ml_marker = "app.get('/api/v1/ml/status'"
end_ml_marker = "app.post('/api/benchmark/run'"

start_ml_idx = content.find(start_ml_marker)
end_ml_idx = content.find(end_ml_marker)

print(f"start_ml_idx: {start_ml_idx}, end_ml_idx: {end_ml_idx}")

new_ml_section = """app.get('/api/v1/ml/status', async (req, res) => {
  try {
    const health = await checkMLHealth();
    const info = await getMLModelInfo();
    res.json({
      success: true,
      service: 'MongoTrace-ML-Engine',
      health,
      modelInfo: info
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/ml/detections', async (req, res) => {
  try {
    const { investigationId, caseId, threatLevel, minScore, isAnomaly, limit = 50, skip = 0 } = req.query;
    const result = await getMLDetections({
      investigationId,
      caseId,
      threatLevel,
      minScore,
      isAnomaly,
      limit,
      skip
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/v1/ml/stats', async (req, res) => {
  try {
    const { investigationId } = req.query;
    const stats = await getMLStats(investigationId);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/ml/predict', async (req, res) => {
  try {
    const result = await scoreEvidenceItem(req.body);
    if (req.body.evidenceId) {
      recordMLDetection(result, req.body).catch(err => {
        console.warn('[ML Predict] Persistence note:', err.message);
      });
    }
    res.json({ success: true, prediction: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/ml/predict-batch', async (req, res) => {
  try {
    const items = req.body.items || req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Items array is required' });
    }
    const results = await scoreEvidenceBatch(items);
    const anomaliesCount = results.filter(r => r.is_anomaly).length;

    // Persist predictions for items that have evidenceId
    for (let i = 0; i < items.length; i++) {
      if (items[i].evidenceId && results[i]) {
        recordMLDetection(results[i], items[i]).catch(err => {
          console.warn('[ML Predict Batch] Persistence note:', err.message);
        });
      }
    }

    res.json({
      success: true,
      total: results.length,
      anomaliesDetected: anomaliesCount,
      normalCount: results.length - anomaliesCount,
      predictions: results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/ml/evaluate-case/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await evaluateInvestigationWithML(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Schema Performance Benchmarking Harness
// -------------------------------------------------------------
"""

# Find the header before app.post('/api/benchmark/run'
bench_header = "// -------------------------------------------------------------\r\n// Schema Performance Benchmarking Harness\r\n// -------------------------------------------------------------\r\n"
if bench_header in content:
    bench_header_idx = content.find(bench_header, start_ml_idx)
    content = content[:start_ml_idx] + new_ml_section + content[bench_header_idx + len(bench_header):]
else:
    content = content[:start_ml_idx] + new_ml_section + content[end_ml_idx:]

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated server.js with ML detection routes and ALLOWED_QUERY_COLLECTIONS!")
