const { getDB, logMongoOperation, getDBEvents } = require('./db');
const { createEvidence } = require('./evidenceService');
const { scoreEvidenceBatch } = require('./mlService');

/**
 * Parses raw text or buffer input into JavaScript objects
 * Supports JSON, JSONL, and CSV
 */
function parseRawData(content, format = 'json') {
  if (typeof content !== 'string') {
    content = content.toString('utf-8');
  }

  format = format.toLowerCase();
  const trimmed = content.trim();

  if (format === 'json' || format === 'application/json' || (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fallback to JSONL if JSON parse fails
      return parseJsonLines(trimmed);
    }
  } else if (format === 'jsonl' || format.includes('jsonl') || format.includes('ndjson')) {
    return parseJsonLines(trimmed);
  } else if (format === 'csv' || format.includes('csv')) {
    return parseCSV(trimmed);
  }

  throw new Error(`Unsupported ingestion format: ${format}`);
}

function parseJsonLines(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSONL at line ${idx + 1}: ${err.message}`);
    }
  });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];

  // Parse the complete stream instead of splitting on newlines. CSV permits
  // commas, escaped quotes, and line breaks inside a quoted field.
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === ',') {
      row.push(value.trim());
      value = '';
      atFieldStart = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(value.trim());
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
      value = '';
      atFieldStart = true;
    } else {
      value += ch;
      atFieldStart = false;
    }
  }

  if (inQuotes) throw new Error('CSV parsing error: unterminated quoted field');
  row.push(value.trim());
  if (row.some(cell => cell.length > 0)) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^\uFEFF/, ''));
  if (headers.some(h => !h)) throw new Error('CSV parsing error: header names must not be empty');

  return rows.slice(1).map((columns, rowIndex) => {
    if (columns.length > headers.length) {
      throw new Error(`CSV parsing error: row ${rowIndex + 2} has more values than headers`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, columns[index] || '']));
  });
}

/**
 * Preview and inspect incoming records
 */
function previewIngestion(rawRecords, fieldMapping = {}) {
  const sample = rawRecords.slice(0, 5);
  const detectedKeys = new Set();
  rawRecords.forEach(r => Object.keys(r).forEach(k => detectedKeys.add(k)));

  const mappedPreview = sample.map(raw => {
    return {
      title: raw[fieldMapping.title || 'title'] || raw.title || raw.name || '',
      sourceHost: raw[fieldMapping.sourceHost || 'sourceHost'] || raw.sourceHost || raw.host || '',
      timestamp: raw[fieldMapping.timestamp || 'timestamp'] || raw.timestamp || new Date(),
      severity: raw[fieldMapping.severity || 'severity'] || raw.severity || 'MEDIUM',
      artifactType: raw[fieldMapping.artifactType || 'artifactType'] || raw.artifactType || 'SECURITY_EVENT'
    };
  });

  return {
    totalRecords: rawRecords.length,
    detectedFields: Array.from(detectedKeys),
    sample,
    mappedPreview,
    recommendedMapping: {
      timestamp: ['timestamp', 'time', 'date', '@timestamp', 'event_time', 'datetime'].find(k => detectedKeys.has(k)) || 'timestamp',
      title: ['title', 'name', 'event_name', 'message', 'alert_name'].find(k => detectedKeys.has(k)) || 'title',
      severity: ['severity', 'level', 'priority'].find(k => detectedKeys.has(k)) || 'severity',
      artifactType: ['artifactType', 'evidenceType', 'type', 'category'].find(k => detectedKeys.has(k)) || 'artifactType',
      sourceHost: ['sourceHost', 'host', 'hostname', 'computer_name', 'source_host'].find(k => detectedKeys.has(k)) || 'sourceHost',
      description: ['description', 'desc', 'summary', 'details'].find(k => detectedKeys.has(k)) || 'description'
    }
  };
}

/**
 * Validate records and detect duplicates/conflicts against MongoDB
 */
async function validateIngestionBatch(investigationId, rawRecords, fieldMapping = {}) {
  const db = getDB();
  const validRecords = [];
  const invalidRecords = [];
  const duplicates = [];

  // Query existing items in the investigation to identify duplicates
  const existingEvidence = await db.collection('evidence')
    .find({ $or: [{ investigationId }, { caseId: investigationId }] }, { projection: { evidenceId: 1, currentHash: 1, title: 1, sourceHost: 1, timestamp: 1 } })
    .toArray();
  const existingKeys = new Set(existingEvidence.map(e => `${e.title}|${e.sourceHost}`));

  const seenInBatch = new Set();

  for (let i = 0; i < rawRecords.length; i++) {
    const raw = rawRecords[i];
    const errors = [];

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      invalidRecords.push({ index: i, record: raw, errors: ['Each record must be a JSON object or CSV row'] });
      continue;
    }

    // Map fields
    const title = raw[fieldMapping.title || 'title'] || raw.title || raw.name || raw.event_name;
    const timestampRaw = raw[fieldMapping.timestamp || 'timestamp'] || raw.timestamp || raw['@timestamp'] || raw.time;
    const suppliedSeverity = raw[fieldMapping.severity || 'severity'] || raw.severity;
    const severity = String(suppliedSeverity || 'MEDIUM').toUpperCase();
    const artifactType = (raw[fieldMapping.artifactType || 'artifactType'] || raw.artifactType || 'SECURITY_EVENT').toUpperCase();
    const sourceHost = raw[fieldMapping.sourceHost || 'sourceHost'] || raw.sourceHost || raw.host || 'unknown-host';
    const description = raw[fieldMapping.description || 'description'] || raw.description || '';

    if (!title) errors.push('Missing required title/event name');
    if (suppliedSeverity && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) {
      errors.push(`Invalid severity value: ${suppliedSeverity}`);
    }

    let parsedDate = new Date();
    if (timestampRaw) {
      parsedDate = new Date(timestampRaw);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Invalid timestamp format: ${timestampRaw}`);
      }
    }

    // Check duplicate
    const dedupeKey = `${title}|${sourceHost}|${timestampRaw || ''}`;
    if (seenInBatch.has(dedupeKey) || existingKeys.has(`${title}|${sourceHost}`)) {
      duplicates.push({ index: i, record: raw, reason: 'Duplicate event detected in batch or existing database' });
      continue;
    }
    seenInBatch.add(dedupeKey);

    const canonicalRecord = {
      investigationId,
      caseId: investigationId,
      title: title || 'Untitled Record',
      timestamp: parsedDate,
      severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity) ? severity : 'MEDIUM',
      artifactType,
      sourceHost,
      description,
      metadata: { ...raw },
      rawIndex: i
    };

    if (errors.length > 0) {
      invalidRecords.push({ index: i, record: raw, errors });
    } else {
      validRecords.push(canonicalRecord);
    }
  }

  return {
    total: rawRecords.length,
    validCount: validRecords.length,
    invalidCount: invalidRecords.length,
    duplicateCount: duplicates.length,
    validRecords,
    invalidRecords,
    duplicates
  };
}

/**
 * Execute actual batch ingestion and persist to MongoDB
 */
async function executeIngestion(investigationId, canonicalRecords, sourceSystem = 'MANUAL_IMPORT', actor = 'SecOps-Ingest', options = {}) {
  const db = getDB();
  const t0 = performance.now();
  const jobId = `JOB-2026-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const now = new Date();

  // Create Ingestion Job record in 'ingestion_jobs'
  const jobDoc = {
    jobId,
    investigationId,
    sourceSystem,
    status: 'PROCESSING',
    totalRecords: options.totalRecords ?? canonicalRecords.length,
    acceptedCount: 0,
    rejectedCount: options.preRejectedCount || 0,
    duplicateCount: options.duplicateCount || 0,
    createdAt: now,
    createdBy: actor
  };
  await db.collection('ingestion_jobs').insertOne(jobDoc);

  const ingestedEvidence = [];
  let accepted = 0;
  let persistenceRejected = 0;

      // 1. Batch ML Anomaly Scoring
  let mlPredictions = [];
  try {
    mlPredictions = await scoreEvidenceBatch(canonicalRecords);
  } catch (mlErr) {
    console.warn('[Ingestion ML] Batch scoring warning:', mlErr.message);
  }

  const CHUNK_SIZE = 25;
  const errors = [];
  for (let i = 0; i < canonicalRecords.length; i += CHUNK_SIZE) {
    const chunk = canonicalRecords.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(
      chunk.map((rec, chunkIdx) => {
        const globalIdx = i + chunkIdx;
        const mlPred = mlPredictions[globalIdx] || null;
        return createEvidence({
          ...rec,
          investigationId,
          caseId: investigationId,
          provenance: { source: sourceSystem, jobId, ingestedBy: actor },
          mlAnomalyScore: mlPred ? mlPred.anomaly_score : null,
          mlIsAnomaly: mlPred ? mlPred.is_anomaly : false,
          mlThreatLevel: mlPred ? mlPred.threat_level : 'LOW',
          mlExplanation: mlPred ? mlPred.explanation : null
        }, actor);
      })
    );
    for (const r of chunkResults) {
      if (r.status === 'fulfilled' && r.value) {
        ingestedEvidence.push(r.value);
        accepted++;
      } else {
        persistenceRejected++;
        if (r.reason) errors.push(r.reason.message || String(r.reason));
      }
    }
  }

  const t1 = performance.now();
  const durationMs = Number((t1 - t0).toFixed(2));

  // Update Ingestion Job
  await db.collection('ingestion_jobs').updateOne(
    { jobId },
    {
      $set: {
        status: persistenceRejected === 0 && !(options.preRejectedCount || 0) ? 'COMPLETED' : 'COMPLETED_WITH_WARNINGS',
        acceptedCount: accepted,
        rejectedCount: persistenceRejected + (options.preRejectedCount || 0),
        durationMs,
        completedAt: new Date()
      }
    }
  );

  const rejected = persistenceRejected + (options.preRejectedCount || 0);
  logMongoOperation('insertMany (batched)', 'evidence', { jobId, accepted, rejected }, durationMs, accepted);

  getDBEvents().emit('INGESTION_JOB_COMPLETED', { jobId, investigationId, accepted, rejected });

  return {
    jobId,
    status: rejected === 0 ? 'COMPLETED' : 'COMPLETED_WITH_WARNINGS',
    totalRecords: options.totalRecords ?? canonicalRecords.length,
    acceptedCount: accepted,
    rejectedCount: rejected,
    durationMs,
    ingestedEvidence: ingestedEvidence.slice(0, 5)
  };
}

module.exports = {
  parseRawData,
  previewIngestion,
  validateIngestionBatch,
  executeIngestion
};
