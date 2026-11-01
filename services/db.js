if (typeof process.loadEnvFile === 'function') { try { process.loadEnvFile(); } catch (_) {} }
const { MongoClient, GridFSBucket } = require('mongodb');
const EventEmitter = require('events');

// Primary connection string: supports cloud MongoDB Atlas URI or local service
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'mongotrace';

// Configure reliable DNS servers for Atlas SRV lookups on Windows if srv protocol is used
if (MONGO_URI.startsWith('mongodb+srv://')) {
  try {
    const dns = require('dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (_) {}
}

let client = null;
let db = null;
let gridfsBucket = null;
let isReplicaSet = false;
let serverInfo = null;

// Event emitter for database write events (ensures real-time streaming on both standalone & replSet)
const dbEvents = new EventEmitter();

// Ring buffer of last 50 MongoDB queries/operations for the live MQL Inspector
const mongoQueryLog = [];
const MAX_QUERY_LOGS = 50;

function logMongoOperation(operation, collection, payload, durationMs, resultCount = 1) {
  let mongoshCommand = `db.${collection}.${operation}(`;
  if (payload) {
    mongoshCommand += typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  }
  mongoshCommand += ')';

  const entry = {
    id: `MQL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date(),
    operation,
    collection,
    payload,
    durationMs: Number(durationMs.toFixed(2)),
    resultCount,
    mongoshCommand
  };

  mongoQueryLog.unshift(entry);
  if (mongoQueryLog.length > MAX_QUERY_LOGS) {
    mongoQueryLog.pop();
  }

  // Also emit to query log listeners
  dbEvents.emit('MQL_LOG', entry);
}

function getMongoQueryLogs() {
  return mongoQueryLog;
}

async function closeDB() {
  const activeClient = client;
  client = null;
  db = null;
  gridfsBucket = null;
  serverInfo = null;
  isReplicaSet = false;
  if (activeClient) await activeClient.close();
}

async function connectDB() {
  if (db) return { db, client, gridfsBucket, isReplicaSet, serverInfo };

  console.log(`[MongoTrace DB] Connecting to MongoDB instance at ${MONGO_URI}/${DB_NAME}...`);
  
  client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 6000,
  });

  await client.connect();
  db = client.db(DB_NAME);
  gridfsBucket = new GridFSBucket(db, { bucketName: 'evidence_vault' });

  // Probe server status & replica set status
  try {
    const admin = client.db().admin();
    const buildInfo = await admin.command({ buildInfo: 1 });
    serverInfo = {
      version: buildInfo.version,
      modules: buildInfo.modules || [],
      gitVersion: buildInfo.gitVersion,
      sysInfo: buildInfo.sysInfo
    };

    const rsStatus = await admin.command({ replSetGetStatus: 1 }).catch(() => null);
    isReplicaSet = !!(rsStatus && rsStatus.ok);

    console.log(`[MongoTrace DB] Connected successfully to MongoDB v${serverInfo.version} on ${MONGO_URI}!`);
    console.log(`[MongoTrace DB] Mode: ${isReplicaSet ? 'Replica Set (rs0)' : 'Standalone Server'}`);
  } catch (err) {
    console.warn('[MongoTrace DB] Server probe warning:', err.message);
  }

  await initializeIndexes();
  return { db, client, gridfsBucket, isReplicaSet, serverInfo };
}

async function initializeIndexes() {
  try {
    const t0 = performance.now();
    console.log('[MongoTrace DB] Ensuring indexes on MongoDB collections...');

    // 1. Investigations collection
    await db.collection('investigations').createIndex({ investigationId: 1 }, { unique: true });
    await db.collection('investigations').createIndex({ status: 1, severity: 1, createdAt: -1 });
    await db.collection('investigations').createIndex({ caseId: 1 }, { sparse: true });

    // Cases collection (backward compatibility)
    await db.collection('cases').createIndex({ caseId: 1 }, { unique: true });
    await db.collection('cases').createIndex({ status: 1, severity: 1, createdAt: -1 });

    // 2. Evidence collection
    await db.collection('evidence').createIndex({ evidenceId: 1 }, { unique: true });
    await db.collection('evidence').createIndex({ investigationId: 1, eventTimestamp: -1 });
    await db.collection('evidence').createIndex({ caseId: 1, timestamp: 1 });
    await db.collection('evidence').createIndex({ evidenceType: 1, eventTimestamp: -1 });
    await db.collection('evidence').createIndex({ artifactType: 1, severity: 1 });
    await db.collection('evidence').createIndex({ sourceHost: 1, eventTimestamp: -1 });
    await db.collection('evidence').createIndex({ sha256: 1 });
    await db.collection('evidence').createIndex({ currentHash: 1 });
    await db.collection('evidence').createIndex({ "entities.value": 1, timestamp: 1 });
    await db.collection('evidence').createIndex(
      { title: 'text', description: 'text', 'metadata.filePath': 'text', 'metadata.commandLine': 'text' },
      { name: 'evidence_text_idx', weights: { title: 5, 'metadata.commandLine': 4, description: 2, 'metadata.filePath': 3 } }
    );

    // 3. Evidence Versions collection
    await db.collection('evidence_versions').createIndex({ evidenceId: 1, version: 1 }, { unique: true });
    await db.collection('evidence_versions').createIndex({ investigationId: 1, timestamp: -1 });
    await db.collection('evidence_versions').createIndex({ caseId: 1, timestamp: -1 });

    // 4. Entities collection
    await db.collection('entities').createIndex({ entityType: 1, normalizedValue: 1 }, { unique: true });
    await db.collection('entities').createIndex({ investigationIds: 1 });

    // 5. Relationships collection
    await db.collection('relationships').createIndex({ sourceId: 1, targetId: 1, relationshipType: 1 });
    await db.collection('relationships').createIndex({ investigationId: 1 });
    await db.collection('evidence_relations').createIndex({ caseId: 1, sourceEvidenceId: 1, targetEvidenceId: 1 });

    // 6. Ingestion Jobs collection
    await db.collection('ingestion_jobs').createIndex({ jobId: 1 }, { unique: true });
    await db.collection('ingestion_jobs').createIndex({ investigationId: 1, createdAt: -1 });

    // 7. Audit Logs collection (and chain of custody)
    await db.collection('audit_logs').createIndex({ logId: 1 }, { unique: true });
    await db.collection('audit_logs').createIndex({ evidenceId: 1, timestamp: 1 });
    await db.collection('audit_logs').createIndex({ investigationId: 1, timestamp: -1 });
    await db.collection('audit_logs').createIndex(
      { integrityFingerprint: 1 },
      { unique: true, sparse: true, name: 'unique_integrity_violation_fingerprint' }
    );
    await db.collection('chain_of_custody').createIndex({ evidenceId: 1, recordedAt: 1 });

    // 8. Detection Rules collection
    await db.collection('detection_rules').createIndex({ ruleId: 1 }, { unique: true });
    await db.collection('detection_rules').createIndex({ severity: 1, enabled: 1 });

    // 9. Derived Findings collection
    await db.collection('derived_findings').createIndex({ findingId: 1 }, { unique: true });
    await db.collection('derived_findings').createIndex({ investigationId: 1, severity: 1, detectionTimestamp: -1 });

    // 10. Schema Experiments collection
    await db.collection('schema_experiments').createIndex({ experimentId: 1 }, { unique: true });
    await db.collection('schema_experiments').createIndex({ createdAt: -1 });

    // 11. ML Detections collection (Isolation Forest Anomaly Findings)
    await db.collection('ml_detections').createIndex({ detectionId: 1 }, { unique: true });
    await db.collection('ml_detections').createIndex({ evidenceId: 1 });
    await db.collection('ml_detections').createIndex({ investigationId: 1, anomalyScore: -1 });
    await db.collection('ml_detections').createIndex({ caseId: 1, anomalyScore: -1 });
    await db.collection('ml_detections').createIndex({ isAnomaly: 1, detectedAt: -1 });
    await db.collection('ml_detections').createIndex({ threatLevel: 1, detectedAt: -1 });
    await db.collection('ml_detections').createIndex({ detectedAt: -1 });

    // Schema benchmark collections indexes
    await db.collection('schema_bench_referenced_cases').createIndex({ caseId: 1 }, { unique: true });
    await db.collection('schema_bench_referenced_items').createIndex({ caseId: 1, timestamp: 1 });
    await db.collection('schema_bench_embedded').createIndex({ caseId: 1 }, { unique: true });
    await db.collection('schema_bench_hybrid').createIndex({ caseId: 1, bucketIndex: 1 }, { unique: true });

    const t1 = performance.now();
    logMongoOperation('createIndex', 'collections', { verifiedCollections: 12 }, t1 - t0, 15);
    console.log('[MongoTrace DB] All required indexes verified on MongoDB.');
  } catch (err) {
    console.error('[MongoTrace DB] Error setting up indexes:', err.message);
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
}

function getClient() {
  if (!client) throw new Error('Client not initialized. Call connectDB() first.');
  return client;
}

function getGridFS() {
  if (!gridfsBucket) throw new Error('GridFS not initialized. Call connectDB() first.');
  return gridfsBucket;
}

function getIsReplicaSet() {
  return isReplicaSet;
}

function getServerInfo() {
  return serverInfo;
}

function getDBEvents() {
  return dbEvents;
}

module.exports = {
  connectDB,
  getDB,
  getClient,
  getGridFS,
  getIsReplicaSet,
  getServerInfo,
  getDBEvents,
  logMongoOperation,
  getMongoQueryLogs,
  closeDB
};
