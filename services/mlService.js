/**
 * MongoTrace Machine Learning Bridge Service
 * Connects Node.js backend to the Python FastAPI Isolation Forest microservice.
 * Provides real-time anomaly scoring, explainable forensics attribution,
 * persistent MongoDB storage in ml_detections, and graceful heuristic degradation.
 */

const crypto = require('crypto');
const { getDB, logMongoOperation, getDBEvents } = require('./db');

const ML_API_URL = process.env.ML_API_URL || 'http://127.0.0.1:5055';
const REQUEST_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS || '2500', 10);

/**
 * Check if the Python FastAPI ML microservice is reachable
 */
async function checkMLHealth() {
  try {
    const res = await fetch(`${ML_API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) {
      return { available: false, status: 'HTTP_ERROR', statusCode: res.status };
    }
    const data = await res.json();
    return { available: true, status: 'ONLINE', ...data };
  } catch (err) {
    return { available: false, status: 'OFFLINE', error: err.message };
  }
}

/**
 * Retrieve model metadata and validation metrics from Python ML service
 */
async function getMLModelInfo() {
  try {
    const res = await fetch(`${ML_API_URL}/model-info`, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!res.ok) {
      return { success: false, error: `ML Service returned status ${res.status}` };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    return {
      success: false,
      error: `Could not reach Python ML API at ${ML_API_URL}: ${err.message}`,
      fallback: true
    };
  }
}

/**
 * Local fallback heuristic scorer in case the Python microservice is offline
 */
function localHeuristicScorer(doc) {
  const meta = doc.metadata || {};
  let score = 0.20;
  const reasons = [];

  const cmd = String(meta.commandLine || doc.description || '').toLowerCase();
  const proc = String(meta.processName || '').toLowerCase();
  const lotlTools = ['powershell', 'wmic', 'certutil', 'vssadmin', 'psexec', 'procdump', 'mimikatz', 'regsvr32'];

  if (lotlTools.some(t => cmd.includes(t) || proc.includes(t))) {
    score += 0.35;
    reasons.push('Presence of dual-use administrative binary (LOLBAS)');
  }

  const bytes = Number(meta.bytesTransferred || meta.fileSize || 0);
  if (bytes > 10000000) {
    score += 0.35;
    reasons.push(`High outbound byte transfer volume (${(bytes / (1024 * 1024)).toFixed(1)} MB)`);
  } else if (bytes > 1000000) {
    score += 0.15;
  }

  const port = Number(meta.port || meta.destPort || 0);
  if ([4444, 8443, 9001, 1337].includes(port)) {
    score += 0.25;
    reasons.push(`Suspicious C2 destination port (TCP/${port})`);
  }

  const failed = Number(meta.failedLogins || 0);
  if (failed > 5) {
    score += 0.25;
    reasons.push(`Multiple preceding authentication failures (${failed} attempts)`);
  }

  score = Math.min(0.99, Math.max(0.05, score));
  const isAnomaly = score >= 0.50;

  let threatLevel = 'LOW';
  if (score >= 0.80) threatLevel = 'CRITICAL';
  else if (score >= 0.60) threatLevel = 'HIGH';
  else if (score >= 0.45) threatLevel = 'MEDIUM';

  return {
    is_anomaly: isAnomaly,
    anomaly_score: Number(score.toFixed(4)),
    threat_level: threatLevel,
    confidence: 0.80,
    decision_score: isAnomaly ? -0.15 : 0.15,
    features_extracted: {
      duration: meta.duration || 0.5,
      src_bytes: bytes,
      dst_bytes: 2048,
      service_port: port || 443,
      conn_count: meta.connCount || 1,
      is_lotl: lotlTools.some(t => cmd.includes(t)) ? 1 : 0,
      payload_entropy: 3.5,
      off_hours_score: 0.2,
      failed_logins: failed
    },
    top_contributing_features: reasons.map(r => ({ feature: 'heuristic', description: r })),
    explanation: reasons.length > 0 ? reasons.join('; ') + '.' : 'Telemetry conforms to baseline.',
    evidence_id: doc.evidenceId,
    provider: 'local_heuristic_fallback'
  };
}

/**
 * Score a single evidence document via Python Isolation Forest
 */
async function scoreEvidenceItem(evidenceDoc) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${ML_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evidenceDoc),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`Python ML API error: HTTP ${res.status}`);
    }

    const data = await res.json();
    const t1 = performance.now();
    logMongoOperation('ml_predict', 'isolation_forest', { evidenceId: evidenceDoc.evidenceId }, t1 - t0, 1);
    data.provider = 'python_isolation_forest';
    return data;
  } catch (err) {
    // Graceful fallback to heuristic scoring
    const fallbackResult = localHeuristicScorer(evidenceDoc);
    fallbackResult.note = `Python ML API unavailable (${err.message}); served via calibrated heuristic engine.`;
    return fallbackResult;
  }
}

/**
 * Batch score multiple evidence documents
 */
async function scoreEvidenceBatch(evidenceDocs) {
  if (!Array.isArray(evidenceDocs) || evidenceDocs.length === 0) {
    return [];
  }

  const t0 = performance.now();
  try {
    const res = await fetch(`${ML_API_URL}/predict-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: evidenceDocs }),
      signal: AbortSignal.timeout(Math.max(REQUEST_TIMEOUT_MS * 2, 5000))
    });

    if (!res.ok) {
      throw new Error(`Python ML API batch error: HTTP ${res.status}`);
    }

    const data = await res.json();
    const t1 = performance.now();
    logMongoOperation('ml_predict_batch', 'isolation_forest', { count: evidenceDocs.length }, t1 - t0, data.anomalies_detected);

    return data.results.map(r => ({ ...r, provider: 'python_isolation_forest' }));
  } catch (err) {
    // Fallback batch scoring
    return evidenceDocs.map(doc => {
      const fb = localHeuristicScorer(doc);
      fb.note = `Batch ML API fallback: ${err.message}`;
      return fb;
    });
  }
}

/**
 * Persist an ML anomaly detection finding into MongoDB ml_detections collection.
 * Uses upsert on evidenceId to ensure idempotency.
 */

/**
 * Helper to resolve both investigationId and legacy caseId for an investigation
 */
async function resolveInvestigationIds(targetId) {
  if (!targetId || targetId === 'ALL') return [];
  const db = getDB();
  const inv = await db.collection('investigations').findOne({
    $or: [{ investigationId: targetId }, { caseId: targetId }]
  });
  const ids = new Set([targetId]);
  if (inv) {
    if (inv.investigationId) ids.add(inv.investigationId);
    if (inv.caseId) ids.add(inv.caseId);
  }
  return Array.from(ids);
}

async function recordMLDetection(prediction, evidenceDoc) {
  if (!prediction || !evidenceDoc) return null;
  const db = getDB();
  const t0 = performance.now();

  const evidenceId = evidenceDoc.evidenceId || prediction.evidence_id;
  const investigationId = evidenceDoc.investigationId || evidenceDoc.caseId || 'INV-2026-DEFAULT';
  const caseId = evidenceDoc.caseId || investigationId;
  const detectionId = `MLD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const detectionDoc = {
    detectionId,
    evidenceId,
    investigationId,
    caseId,
    title: evidenceDoc.title || 'Telemetry Event',
    artifactType: evidenceDoc.artifactType || evidenceDoc.evidenceType || 'SECURITY_EVENT',
    severity: evidenceDoc.severity || 'MEDIUM',
    sourceHost: evidenceDoc.sourceHost || evidenceDoc.host || 'unknown-host',
    eventTimestamp: evidenceDoc.eventTimestamp || evidenceDoc.timestamp ? new Date(evidenceDoc.eventTimestamp || evidenceDoc.timestamp) : new Date(),
    anomalyScore: Number(prediction.anomaly_score !== undefined ? prediction.anomaly_score : 0.0),
    decisionScore: Number(prediction.decision_score !== undefined ? prediction.decision_score : 0.0),
    isAnomaly: Boolean(prediction.is_anomaly),
    threatLevel: prediction.threat_level || 'LOW',
    confidence: Number(prediction.confidence !== undefined ? prediction.confidence : 0.8),
    features: prediction.features_extracted || {},
    topContributingFeatures: prediction.top_contributing_features || [],
    explanation: prediction.explanation || 'Telemetry conforms to baseline distribution.',
    provider: prediction.provider || 'python_isolation_forest',
    detectedAt: new Date()
  };

  await db.collection('ml_detections').updateOne(
    { evidenceId: detectionDoc.evidenceId },
    { $set: detectionDoc },
    { upsert: true }
  );

  const t1 = performance.now();
  logMongoOperation('updateOne (upsert)', 'ml_detections', { evidenceId: detectionDoc.evidenceId, isAnomaly: detectionDoc.isAnomaly }, t1 - t0, 1);
  getDBEvents().emit('ML_DETECTION_RECORDED', detectionDoc);

  return detectionDoc;
}

/**
 * Query ML anomaly detections from MongoDB with rich filtering and pagination
 */
async function getMLDetections({ investigationId, caseId, threatLevel, minScore, isAnomaly, limit = 50, skip = 0 } = {}) {
  const db = getDB();
  const query = {};

  const targetInv = investigationId || caseId;
  if (targetInv && targetInv !== 'ALL') {
    const ids = await resolveInvestigationIds(targetInv);
    query.$or = [
      { investigationId: { $in: ids } },
      { caseId: { $in: ids } }
    ];
  }

  if (threatLevel && threatLevel !== 'ALL') {
    query.threatLevel = threatLevel.toUpperCase();
  }

  if (minScore !== undefined && minScore !== null && minScore !== '') {
    query.anomalyScore = { $gte: parseFloat(minScore) };
  }

  if (isAnomaly !== undefined && isAnomaly !== null && isAnomaly !== '') {
    query.isAnomaly = isAnomaly === true || isAnomaly === 'true';
  }

  const total = await db.collection('ml_detections').countDocuments(query);
  const items = await db.collection('ml_detections')
    .find(query)
    .sort({ detectedAt: -1, anomalyScore: -1 })
    .skip(parseInt(skip, 10))
    .limit(parseInt(limit, 10))
    .toArray();

  return { total, count: items.length, detections: items };
}

/**
 * Aggregated ML statistics for the dashboard
 */
async function getMLStats(investigationId = null) {
  const db = getDB();
  const matchStage = {};

  if (investigationId && investigationId !== 'ALL') {
    const ids = await resolveInvestigationIds(investigationId);
    matchStage.$or = [
      { investigationId: { $in: ids } },
      { caseId: { $in: ids } }
    ];
  }

  const pipeline = [
    ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalScored: { $sum: 1 },
              totalAnomalies: { $sum: { $cond: ['$isAnomaly', 1, 0] } },
              normalEvents: { $sum: { $cond: ['$isAnomaly', 0, 1] } },
              suspiciousEvents: {
                $sum: { $cond: [{ $in: ['$threatLevel', ['HIGH', 'CRITICAL']] }, 1, 0] }
              },
              avgAnomalyScore: { $avg: '$anomalyScore' }
            }
          }
        ],
        byThreatLevel: [
          { $group: { _id: '$threatLevel', count: { $sum: 1 } } }
        ],
        topAnomalies: [
          { $match: { isAnomaly: true } },
          { $sort: { anomalyScore: -1 } },
          { $limit: 6 }
        ]
      }
    }
  ];

  const results = await db.collection('ml_detections').aggregate(pipeline).toArray();
  const facet = results[0] || {};
  const summary = (facet.summary && facet.summary[0]) || {
    totalScored: 0,
    totalAnomalies: 0,
    normalEvents: 0,
    suspiciousEvents: 0,
    avgAnomalyScore: 0.0
  };

  const threatBreakdown = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  (facet.byThreatLevel || []).forEach(b => {
    if (b._id) threatBreakdown[b._id] = b.count;
  });

  return {
    totalScored: summary.totalScored,
    totalAnomalies: summary.totalAnomalies,
    normalEvents: summary.normalEvents,
    suspiciousEvents: summary.suspiciousEvents,
    avgAnomalyScore: Number((summary.avgAnomalyScore || 0).toFixed(4)),
    byThreatLevel: threatBreakdown,
    topAnomalies: facet.topAnomalies || []
  };
}

/**
 * Evaluate all evidence records for an investigation through ML and persist detections
 */
async function evaluateInvestigationWithML(investigationId) {
  const db = getDB();
  const ids = await resolveInvestigationIds(investigationId);
  const evidenceList = await db.collection('evidence')
    .find({
      $or: [
        { investigationId: { $in: ids } },
        { caseId: { $in: ids } }
      ]
    })
    .toArray();

  if (evidenceList.length === 0) {
    return {
      success: true,
      investigationId,
      evaluatedCount: 0,
      anomaliesFound: 0,
      detections: []
    };
  }

  const predictions = await scoreEvidenceBatch(evidenceList);
  const detections = [];
  let anomaliesFound = 0;

  for (let i = 0; i < evidenceList.length; i++) {
    const item = evidenceList[i];
    const pred = predictions[i] || localHeuristicScorer(item);

    if (pred.is_anomaly) anomaliesFound++;

    // Update evidence item in MongoDB with ML tags
    await db.collection('evidence').updateOne(
      { evidenceId: item.evidenceId },
      {
        $set: {
          mlAnomalyScore: pred.anomaly_score,
          mlIsAnomaly: Boolean(pred.is_anomaly),
          mlThreatLevel: pred.threat_level,
          mlExplanation: pred.explanation,
          updatedAt: new Date()
        }
      }
    );

    // Persist to ml_detections
    const det = await recordMLDetection(pred, item);
    detections.push(det);
  }

  return {
    success: true,
    investigationId,
    evaluatedCount: evidenceList.length,
    anomaliesFound,
    detections
  };
}

module.exports = {
  checkMLHealth,
  getMLModelInfo,
  scoreEvidenceItem,
  scoreEvidenceBatch,
  localHeuristicScorer,
  recordMLDetection,
  getMLDetections,
  getMLStats,
  evaluateInvestigationWithML,
  ML_API_URL
};
