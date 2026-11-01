const crypto = require('crypto');
const { getDB, getClient, getIsReplicaSet, getDBEvents, logMongoOperation } = require('./db');
const { scoreEvidenceItem, recordMLDetection } = require('./mlService');

function calculateHash(payload) {
  const normalized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

const EVIDENCE_MUTABLE_FIELDS = new Set([
  'title', 'description', 'severity', 'artifactType', 'evidenceType',
  'sourceHost', 'timestamp', 'eventTimestamp', 'mitreTactic',
  'mitreTechnique', 'tags', 'metadata'
]);

function getSafeEvidenceUpdate(updateFields = {}) {
  if (!updateFields || typeof updateFields !== 'object' || Array.isArray(updateFields)) {
    throw new Error('Evidence updateFields must be an object.');
  }

  const safe = {};
  const metadata = { ...(updateFields.metadata || {}) };
  for (const [key, value] of Object.entries(updateFields)) {
    if (key.startsWith('metadata.')) {
      const metadataKey = key.slice('metadata.'.length);
      if (!metadataKey || metadataKey.includes('$') || metadataKey.includes('.')) {
        throw new Error(`Invalid metadata field: ${key}`);
      }
      metadata[metadataKey] = value;
    } else if (EVIDENCE_MUTABLE_FIELDS.has(key) && key !== 'metadata') {
      safe[key] = value;
    } else if (key !== 'metadata') {
      throw new Error(`Field '${key}' is immutable or not permitted in an evidence update.`);
    }
  }
  if (Object.keys(metadata).length > 0) safe.metadata = metadata;
  if (Object.keys(safe).length === 0) throw new Error('No permitted evidence fields supplied for update.');

  if (safe.timestamp !== undefined && Number.isNaN(new Date(safe.timestamp).getTime())) {
    throw new Error('timestamp must be a valid ISO-8601 date.');
  }
  if (safe.eventTimestamp !== undefined && Number.isNaN(new Date(safe.eventTimestamp).getTime())) {
    throw new Error('eventTimestamp must be a valid ISO-8601 date.');
  }
  if (safe.severity !== undefined) {
    safe.severity = String(safe.severity).toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(safe.severity)) {
      throw new Error('severity must be LOW, MEDIUM, HIGH, or CRITICAL.');
    }
  }
  return safe;
}

/**
 * Standardizes evidence payload for deterministic canonical SHA-256 calculation
 */
function getCanonicalEvidencePayload(doc) {
  return {
    investigationId: doc.investigationId || doc.caseId || '',
    caseId: doc.caseId || doc.investigationId || '',
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : (doc.timestamp ? new Date(doc.timestamp).toISOString() : ''),
    artifactType: doc.artifactType || doc.evidenceType || 'SECURITY_EVENT',
    severity: doc.severity || 'MEDIUM',
    sourceHost: doc.sourceHost || 'unknown-host',
    title: doc.title || '',
    description: doc.description || '',
    mitreTactic: doc.mitreTactic || '',
    mitreTechnique: doc.mitreTechnique || '',
    metadata: doc.metadata || {},
    entities: (doc.entities || []).map(e => ({ type: e.type, value: e.value })),
    version: doc.version || 1
  };
}

/**
 * Extract entities from polymorphic evidence document (inspects both root & metadata)
 */
function extractEntities(doc) {
  const entities = [];
  const meta = doc.metadata || {};

  const host = doc.sourceHost || doc.host || meta.host || meta.sourceHost;
  if (host) entities.push({ type: 'HOST', value: String(host).toLowerCase() });

  const srcIp = doc.sourceIp || meta.sourceIp || meta.src_ip;
  if (srcIp) entities.push({ type: 'IP', value: String(srcIp) });

  const dstIp = doc.destinationIp || meta.destinationIp || meta.dest_ip;
  if (dstIp) entities.push({ type: 'IP', value: String(dstIp) });

  const remoteIp = doc.remoteIp || meta.remoteIp;
  if (remoteIp) entities.push({ type: 'IP', value: String(remoteIp) });

  const user = doc.user || meta.user || meta.userName || meta.account || meta.username;
  if (user) entities.push({ type: 'USER', value: String(user).toLowerCase() });

  const proc = meta.processName || meta.image || doc.processName;
  if (proc) entities.push({ type: 'PROCESS', value: String(proc) });

  const parentProc = meta.parentProcessName || doc.parentProcessName;
  if (parentProc) entities.push({ type: 'PROCESS', value: String(parentProc) });

  const file = doc.fileName || meta.fileName || meta.filePath || meta.filename;
  if (file) entities.push({ type: 'FILE', value: String(file) });

  const sha = doc.sha256 || meta.sha256;
  if (sha) entities.push({ type: 'HASH', value: String(sha).toLowerCase() });

  const domain = meta.domain || meta.domainName || meta.dnsQuery;
  if (domain) entities.push({ type: 'DOMAIN', value: String(domain).toLowerCase() });

  const seen = new Set();
  const deduped = [];
  for (const ent of entities) {
    const key = `${ent.type}:${ent.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ent);
    }
  }
  return deduped;
}

/**
 * Insert new evidence item with initial Chain of Custody & Audit entry
 */
async function createEvidence(evidenceData, actor = 'SecOps-Ingest') {
  if (!evidenceData || !evidenceData.title) {
    throw new Error('Evidence title is required.');
  }

  const db = getDB();
  const client = getClient();
  const isReplicaSet = getIsReplicaSet();
  const dbEvents = getDBEvents();

  const timestamp = evidenceData.timestamp ? new Date(evidenceData.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) throw new Error('Evidence timestamp must be a valid ISO-8601 date.');
  const ingestedAt = new Date();
  const evidenceId = evidenceData.evidenceId || `EV-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let investigationId = evidenceData.investigationId || evidenceData.caseId || 'INV-2026-DEFAULT';
  let caseId = evidenceData.caseId || evidenceData.investigationId || investigationId;
  if ((!evidenceData.caseId || !evidenceData.investigationId) && investigationId !== 'INV-2026-DEFAULT') {
    try {
      const parentInv = await db.collection('investigations').findOne({
        $or: [{ investigationId }, { caseId }]
      });
      if (parentInv) {
        if (parentInv.investigationId) investigationId = parentInv.investigationId;
        if (parentInv.caseId) caseId = parentInv.caseId;
      }
    } catch (_) {}
  }

  const entities = evidenceData.entities && evidenceData.entities.length > 0 
    ? evidenceData.entities 
    : extractEntities(evidenceData);

  let mlPrediction = null;
  if (evidenceData.mlAnomalyScore === undefined) {
    try {
      mlPrediction = await scoreEvidenceItem(evidenceData);
    } catch (_) {}
  }
  const initialPayload = {
    investigationId,
    caseId,
    timestamp,
    eventTimestamp: timestamp,
    ingestionTimestamp: ingestedAt,
    artifactType: evidenceData.artifactType || evidenceData.evidenceType || 'SECURITY_EVENT',
    evidenceType: evidenceData.evidenceType || evidenceData.artifactType || 'SECURITY_EVENT',
    severity: evidenceData.severity || 'MEDIUM',
    sourceHost: evidenceData.sourceHost || evidenceData.host || 'unknown-host',
    title: evidenceData.title,
    description: evidenceData.description || '',
    mitreTactic: evidenceData.mitreTactic || 'Defense Evasion',
    mitreTechnique: evidenceData.mitreTechnique || '',
    metadata: evidenceData.metadata || {},
    entities,
    version: 1
  };

  const canonicalPayload = getCanonicalEvidencePayload(initialPayload);
  const payloadHash = calculateHash(canonicalPayload);

  const newDoc = {
    ...initialPayload,
    evidenceId,
    currentHash: payloadHash,
    sha256: evidenceData.sha256 || (evidenceData.metadata && evidenceData.metadata.sha256) || payloadHash,
    tags: evidenceData.tags || [],
    gridfsFileId: evidenceData.gridfsFileId || null,
    integrityStatus: 'VERIFIED',
    mlAnomalyScore: evidenceData.mlAnomalyScore !== undefined ? evidenceData.mlAnomalyScore : (mlPrediction ? mlPrediction.anomaly_score : null),
    mlIsAnomaly: evidenceData.mlIsAnomaly !== undefined ? Boolean(evidenceData.mlIsAnomaly) : (mlPrediction ? Boolean(mlPrediction.is_anomaly) : false),
    mlThreatLevel: evidenceData.mlThreatLevel || (mlPrediction ? mlPrediction.threat_level : 'LOW'),
    mlExplanation: evidenceData.mlExplanation || (mlPrediction ? mlPrediction.explanation : null),
    provenance: evidenceData.provenance || { source: evidenceData.sourceSystem || 'API_INGEST', ingestedBy: actor },
    createdBy: actor,
    createdAt: ingestedAt,
    updatedAt: ingestedAt
  };

  const custodyEntry = {
    custodyId: `COC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    evidenceId,
    investigationId,
    caseId,
    version: 1,
    action: 'INITIAL_INGESTION',
    actor,
    timestamp: ingestedAt,
    recordedAt: ingestedAt,
    previousHash: 'GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000000000000',
    currentHash: payloadHash,
    integrityVerified: true,
    signature: calculateHash(`GENESIS:${payloadHash}:${actor}:${newDoc.createdAt.toISOString()}`)
  };

  const auditEntry = {
    logId: `AUDIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    investigationId,
    evidenceId,
    action: 'EVIDENCE_INGESTED',
    actor,
    timestamp: ingestedAt,
    resultingHash: payloadHash,
    details: { title: newDoc.title, severity: newDoc.severity, artifactType: newDoc.artifactType }
  };

  const versionSnapshot = {
    evidenceId,
    investigationId,
    caseId,
    version: 1,
    snapshot: newDoc,
    modifiedBy: actor,
    reason: 'Initial Ingestion and Preservation',
    timestamp: ingestedAt
  };

  const t0 = performance.now();

  if (isReplicaSet) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('evidence').insertOne(newDoc, { session });
        await db.collection('chain_of_custody').insertOne(custodyEntry, { session });
        await db.collection('audit_logs').insertOne(auditEntry, { session });
        await db.collection('evidence_versions').insertOne(versionSnapshot, { session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    await db.collection('evidence').insertOne(newDoc);
    await db.collection('chain_of_custody').insertOne(custodyEntry);
    await db.collection('audit_logs').insertOne(auditEntry);
    await db.collection('evidence_versions').insertOne(versionSnapshot);
  }

  // Populate or update the 'entities' collection
  for (const ent of entities) {
    await db.collection('entities').updateOne(
      { entityType: ent.type, normalizedValue: ent.value },
      {
        $setOnInsert: {
          entityId: `ENT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
          entityType: ent.type,
          normalizedValue: ent.value,
          createdAt: new Date()
        },
        $addToSet: {
          investigationIds: investigationId,
          evidenceIds: evidenceId
        },
        $set: { lastSeen: timestamp }
      },
      { upsert: true }
    );
  }

  // Also auto-generate relationship edges if multiple entities exist
  if (entities.length >= 2) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        await db.collection('relationships').updateOne(
          { sourceId: `${entities[i].type}:${entities[i].value}`, targetId: `${entities[j].type}:${entities[j].value}` },
          {
            $setOnInsert: {
              relationshipId: `REL-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              sourceId: `${entities[i].type}:${entities[i].value}`,
              targetId: `${entities[j].type}:${entities[j].value}`,
              relationshipType: 'ASSOCIATED_WITH',
              createdAt: new Date()
            },
            $addToSet: {
              investigationIds: investigationId,
              evidenceIds: evidenceId
            }
          },
          { upsert: true }
        );
      }
    }
  }

  // Update investigation evidenceCount
  await db.collection('investigations').updateOne(
    { $or: [{ investigationId }, { caseId }] },
    { $inc: { evidenceCount: 1 }, $set: { updatedAt: new Date() } }
  );

  const t1 = performance.now();
  logMongoOperation('insertOne', 'evidence', { evidenceId: newDoc.evidenceId, investigationId, title: newDoc.title }, t1 - t0, 1);

  // Record in ml_detections collection if scored
  if (mlPrediction || evidenceData.mlAnomalyScore !== undefined) {
    const scoreInfo = mlPrediction || {
      anomaly_score: newDoc.mlAnomalyScore,
      is_anomaly: newDoc.mlIsAnomaly,
      threat_level: newDoc.mlThreatLevel,
      explanation: newDoc.mlExplanation,
      confidence: 0.8
    };
    try {
      await recordMLDetection(scoreInfo, newDoc);
    } catch (detErr) {
      console.warn('[Evidence ML] Detection persistence note:', detErr.message);
    }
  }

  dbEvents.emit('EVIDENCE_CREATED', newDoc);
  return newDoc;
}

/**
 * Update and version an existing piece of evidence
 */
async function updateEvidenceWithVersion(evidenceId, updateFields, actor = 'Forensic-Analyst', reason = 'Metadata refinement') {
  const db = getDB();
  const client = getClient();
  const isReplicaSet = getIsReplicaSet();
  const dbEvents = getDBEvents();

  const t0 = performance.now();
  const currentDoc = await db.collection('evidence').findOne({ evidenceId });
  if (!currentDoc) {
    throw new Error(`Evidence with ID ${evidenceId} not found.`);
  }

  const safeUpdateFields = getSafeEvidenceUpdate(updateFields);
  const nextVersion = (currentDoc.version || 1) + 1;
  const previousHash = currentDoc.currentHash;

  const updatedMetadata = { ...currentDoc.metadata, ...(safeUpdateFields.metadata || {}) };
  const updatedDocData = {
    ...currentDoc,
    ...safeUpdateFields,
    metadata: updatedMetadata,
    version: nextVersion,
    updatedAt: new Date()
  };

  updatedDocData.entities = extractEntities(updatedDocData);
  delete updatedDocData._id;

  const canonicalPayload = getCanonicalEvidencePayload(updatedDocData);
  const newPayloadHash = calculateHash(canonicalPayload);

  updatedDocData.currentHash = newPayloadHash;
  updatedDocData.integrityStatus = 'VERIFIED';

  const custodyEntry = {
    custodyId: `COC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    evidenceId,
    investigationId: currentDoc.investigationId || currentDoc.caseId,
    caseId: currentDoc.caseId,
    version: nextVersion,
    action: 'VERSION_UPDATE',
    actor,
    timestamp: new Date(),
    recordedAt: new Date(),
    previousHash,
    currentHash: newPayloadHash,
    reason,
    integrityVerified: true,
    signature: calculateHash(`${previousHash}:${newPayloadHash}:${actor}:${reason}`)
  };

  const auditEntry = {
    logId: `AUDIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    investigationId: currentDoc.investigationId || currentDoc.caseId,
    evidenceId,
    action: 'VERSION_UPDATE',
    actor,
    timestamp: new Date(),
    previousHash,
    resultingHash: newPayloadHash,
    reason,
    version: nextVersion
  };

  const versionSnapshot = {
    evidenceId,
    investigationId: currentDoc.investigationId || currentDoc.caseId,
    caseId: currentDoc.caseId,
    version: nextVersion,
    snapshot: updatedDocData,
    modifiedBy: actor,
    reason,
    timestamp: new Date()
  };

  if (isReplicaSet) {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection('evidence').replaceOne({ evidenceId }, updatedDocData, { session });
        await db.collection('chain_of_custody').insertOne(custodyEntry, { session });
        await db.collection('audit_logs').insertOne(auditEntry, { session });
        await db.collection('evidence_versions').insertOne(versionSnapshot, { session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    await db.collection('evidence').replaceOne({ evidenceId }, updatedDocData);
    await db.collection('chain_of_custody').insertOne(custodyEntry);
    await db.collection('audit_logs').insertOne(auditEntry);
    await db.collection('evidence_versions').insertOne(versionSnapshot);
  }

  const t1 = performance.now();
  logMongoOperation('replaceOne', 'evidence', { evidenceId, newVersion: nextVersion, hash: newPayloadHash }, t1 - t0, 1);

  const eventPayload = {
    evidenceId,
    version: nextVersion,
    updatedDoc: updatedDocData,
    custodyEntry
  };
  dbEvents.emit('EVIDENCE_VERSIONED', eventPayload);

  return {
    success: true,
    updatedDoc: updatedDocData,
    version: nextVersion,
    newVersion: nextVersion,
    newHash: newPayloadHash
  };
}

/**
 * Retrieve evidence along with its complete version history and custody chain
 */
async function getEvidenceWithHistory(evidenceId) {
  const db = getDB();
  const t0 = performance.now();

  const evidence = await db.collection('evidence').findOne({ evidenceId });
  if (!evidence) return null;

  const versions = await db.collection('evidence_versions')
    .find({ evidenceId })
    .sort({ version: -1 })
    .toArray();

  const custodyChain = await db.collection('chain_of_custody')
    .find({ evidenceId })
    .sort({ recordedAt: 1 })
    .toArray();

  const auditLogs = await db.collection('audit_logs')
    .find({ evidenceId })
    .sort({ timestamp: -1 })
    .toArray();

  const t1 = performance.now();
  logMongoOperation('find', 'evidence_versions', { evidenceId, versionsCount: versions.length }, t1 - t0, versions.length);

  return { evidence, versions, custodyChain, auditLogs };
}

/**
 * Create causal relation between two evidence items
 */
async function createEvidenceRelation(relationData) {
  const db = getDB();
  const { caseId, investigationId, sourceEvidenceId, targetEvidenceId, relationType } = relationData;

  if (!sourceEvidenceId || !targetEvidenceId || sourceEvidenceId === targetEvidenceId) {
    throw new Error('A relationship requires two distinct evidence IDs.');
  }
  const source = await db.collection('evidence').findOne({ evidenceId: sourceEvidenceId });
  const target = await db.collection('evidence').findOne({ evidenceId: targetEvidenceId });
  if (!source || !target) throw new Error('Both evidence records must exist before a relationship can be created.');

  const sourceInvestigationId = source.investigationId || source.caseId;
  const targetInvestigationId = target.investigationId || target.caseId;
  const requestedInvestigationId = investigationId || caseId;
  if (sourceInvestigationId !== targetInvestigationId ||
      (requestedInvestigationId && requestedInvestigationId !== sourceInvestigationId && requestedInvestigationId !== source.caseId)) {
    throw new Error('Evidence relationships must remain within one investigation.');
  }

  const relation = {
    caseId: source.caseId || sourceInvestigationId,
    investigationId: source.investigationId || sourceInvestigationId,
    sourceEvidenceId,
    targetEvidenceId,
    relationType: relationType || 'CAUSALLY_PRECEDES',
    confidence: relationData.confidence !== undefined ? relationData.confidence : 0.95,
    description: relationData.description || '',
    detectedBy: relationData.detectedBy || 'Analyst-Rule',
    createdAt: new Date()
  };

  const t0 = performance.now();
  await db.collection('relationships').updateOne(
    { sourceId: sourceEvidenceId, targetId: targetEvidenceId },
    { $set: relation },
    { upsert: true }
  );
  await db.collection('evidence_relations').updateOne(
    { caseId: relation.caseId, sourceEvidenceId, targetEvidenceId },
    { $set: relation },
    { upsert: true }
  );
  const t1 = performance.now();
  logMongoOperation('updateOne (upsert)', 'relationships', { source: sourceEvidenceId, target: targetEvidenceId }, t1 - t0, 1);

  getDBEvents().emit('RELATION_CREATED', relation);
  return relation;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function evaluateEvidenceIntegrity(doc) {
  const calculatedHash = calculateHash(getCanonicalEvidencePayload(doc));
  const expectedHash = isSha256(doc.currentHash) ? doc.currentHash : null;
  const isValid = expectedHash === calculatedHash;
  const verificationResult = isValid
    ? 'VERIFIED'
    : (expectedHash ? 'TAMPER_DETECTED' : 'INVALID_STORED_HASH');

  return {
    evidenceId: doc.evidenceId,
    investigationId: doc.investigationId || doc.caseId || null,
    caseId: doc.caseId || doc.investigationId || null,
    title: doc.title,
    version: doc.version || 1,
    expectedHash,
    calculatedHash,
    isValid,
    verificationResult
  };
}

/**
 * Stores one immutable attempt per scan and upserts a canonical violation event
 * for the same evidence/hash mismatch. The attempt stream answers "when was it
 * checked?" while the violation record avoids duplicate alerts on repeat scans.
 */
async function recordIntegrityAudit(db, verification, actor, scanId, auditCollection = null) {
  const auditLogs = auditCollection || db.collection('audit_logs');
  const timestamp = new Date();
  const attempt = {
    logId: `AUDIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    scanId,
    evidenceId: verification.evidenceId,
    investigationId: verification.investigationId,
    caseId: verification.caseId,
    action: 'INTEGRITY_VERIFICATION_ATTEMPT',
    actor,
    timestamp,
    expectedHash: verification.expectedHash,
    calculatedHash: verification.calculatedHash,
    verificationResult: verification.verificationResult,
    details: {
      version: verification.version,
      isValid: verification.isValid
    }
  };
  await auditLogs.insertOne(attempt);

  if (verification.isValid) return { attempt, violation: null };

  const integrityFingerprint = calculateHash({
    evidenceId: verification.evidenceId,
    expectedHash: verification.expectedHash || 'MISSING_OR_INVALID',
    calculatedHash: verification.calculatedHash
  });
  const violation = {
    logId: `AUDIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    integrityFingerprint,
    evidenceId: verification.evidenceId,
    investigationId: verification.investigationId,
    caseId: verification.caseId,
    action: 'INTEGRITY_VIOLATION_DETECTED',
    firstDetectedAt: timestamp,
    details: {
      version: verification.version,
      isValid: false
    }
  };

  await auditLogs.updateOne(
    { integrityFingerprint },
    {
      $setOnInsert: violation,
      $set: {
        lastDetectedAt: timestamp,
        timestamp,
        actor,
        verificationResult: verification.verificationResult,
        expectedHash: verification.expectedHash,
        calculatedHash: verification.calculatedHash
      },
      $inc: { detectionCount: 1 }
    },
    { upsert: true }
  );

  return { attempt, violation };
}

async function persistIntegrityOutcome(db, doc, verification, actor, scanId, auditCollection = null) {
  const verifiedAt = new Date();
  // currentHash is deliberately never changed by verification. Only a permitted
  // version update may produce a new hash and matching version snapshot.
  await db.collection('evidence').updateOne(
    { _id: doc._id },
    {
      $set: {
        integrityStatus: verification.isValid ? 'VERIFIED' : 'TAMPER_DETECTED',
        lastVerifiedAt: verifiedAt,
        lastIntegrityResult: verification.verificationResult
      }
    }
  );
  return recordIntegrityAudit(db, verification, actor, scanId, auditCollection);
}

/**
 * Recalculate hash of one evidence record and persist its verification audit.
 */
async function verifyEvidenceHash(evidenceId, actor = 'Integrity-Scanner', options = {}) {
  const db = getDB();
  const doc = await db.collection('evidence').findOne({ evidenceId });
  if (!doc) throw new Error(`Evidence ${evidenceId} not found`);

  const verification = evaluateEvidenceIntegrity(doc);
  const scanId = options.scanId || `SCAN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  await persistIntegrityOutcome(db, doc, verification, actor, scanId, options.auditCollection);

  return {
    ...verification,
    verified: verification.isValid,
    currentHash: verification.expectedHash,
    recomputedHash: verification.calculatedHash,
    scanId,
    timestamp: new Date()
  };
}

/**
 * Verify all evidence. Per-record persistence failures are reported explicitly
 * instead of being treated as a successful scan.
 */
async function verifyAllEvidence(actor = 'Integrity-Scanner', options = {}) {
  const db = getDB();
  const allDocs = await db.collection('evidence').find({}).toArray();
  const scanId = options.scanId || `SCAN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  let verifiedCount = 0;
  let tamperedCount = 0;
  let failedCount = 0;
  const violations = [];
  const errors = [];

  for (const doc of allDocs) {
    const verification = evaluateEvidenceIntegrity(doc);
    if (verification.isValid) verifiedCount++;
    else {
      tamperedCount++;
      violations.push({
        evidenceId: verification.evidenceId,
        investigationId: verification.investigationId,
        title: verification.title,
        expectedHash: verification.expectedHash,
        actualHash: verification.calculatedHash,
        verificationResult: verification.verificationResult,
        version: verification.version
      });
    }

    try {
      await persistIntegrityOutcome(db, doc, verification, actor, scanId, options.auditCollection);
    } catch (err) {
      failedCount++;
      errors.push({ evidenceId: verification.evidenceId, error: err.message });
    }
  }

  return {
    completed: failedCount === 0,
    scanId,
    totalChecked: allDocs.length,
    verifiedCount,
    tamperedCount,
    failedCount,
    violations,
    errors,
    scannedAt: new Date()
  };
}

/**
 * Test fixture to simulate controlled tampering on an evidence record
 */
async function testTamperEvidence(evidenceId) {
  const db = getDB();
  const doc = await db.collection('evidence').findOne({ evidenceId });
  if (!doc) throw new Error(`Evidence ${evidenceId} not found`);

  // Tampering is intentionally destructive. Permit it only in an isolated test
  // database or on an evidence record explicitly marked as a controlled fixture.
  const isIsolatedTestDatabase = /(^|_)(test|qa|validation|audit)(_|$)/i.test(db.databaseName);
  if (!isIsolatedTestDatabase && !doc.provenance?.controlledTestFixture) {
    throw new Error('Tamper simulation is restricted to controlled test fixtures.');
  }

  // Intentionally modify payload without re-hashing to trigger tamper detection
  const tamperedTitle = `${doc.title} [TAMPERED_BY_TEST_FIXTURE]`;
  await db.collection('evidence').updateOne(
    { evidenceId },
    { $set: { title: tamperedTitle, integrityStatus: 'TAMPER_DETECTED' } }
  );

  return {
    success: true,
    evidenceId,
    message: 'Controlled tamper injected. Hash mismatch will now be flagged during integrity audits.'
  };
}

module.exports = {
  createEvidence,
  updateEvidenceWithVersion,
  getEvidenceWithHistory,
  createEvidenceRelation,
  verifyEvidenceHash,
  verifyAllEvidence,
  evaluateEvidenceIntegrity,
  recordIntegrityAudit,
  testTamperEvidence,
  extractEntities,
  calculateHash,
  getCanonicalEvidencePayload,
  getSafeEvidenceUpdate
};
