const { getDB, logMongoOperation, getDBEvents } = require('./db');

/**
 * Service managing Investigation CRUD operations persisted to MongoDB
 */

async function createInvestigation(data, actor = 'Lead-Investigator') {
  const db = getDB();
  const dbEvents = getDBEvents();
  const t0 = performance.now();

  const idNum = Math.floor(1000 + Math.random() * 9000);
  const investigationId = data.investigationId || `INV-2026-${idNum}`;
  const caseId = data.caseId || `CASE-2026-${idNum}`;
  const now = new Date();

  const doc = {
    investigationId,
    caseId,
    investigationNumber: data.investigationNumber || `INC-2026-${idNum}`,
    title: data.title || 'Untitled Investigation',
    description: data.description || '',
    severity: data.severity || 'MEDIUM', // Low, Medium, High, Critical
    status: data.status || 'Open',       // Open, In Progress, Under Review, Closed
    threatActor: data.threatActor || 'Unknown / Unattributed',
    assignedInvestigator: data.assignedInvestigator || actor,
    leadInvestigator: data.assignedInvestigator || actor,
    notes: data.notes || [],
    involvedEntities: data.involvedEntities || [],
    evidenceCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: actor
  };

  // Persist to MongoDB 'investigations' collection
  await db.collection('investigations').insertOne(doc);

  // Synchronize to 'cases' collection for backwards compatibility
  await db.collection('cases').updateOne(
    { caseId },
    { $set: { ...doc, caseNumber: doc.investigationNumber } },
    { upsert: true }
  );

  // Record in audit_logs
  const auditDoc = {
    logId: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    investigationId,
    action: 'CREATE_INVESTIGATION',
    actor,
    timestamp: now,
    details: { title: doc.title, severity: doc.severity, status: doc.status }
  };
  await db.collection('audit_logs').insertOne(auditDoc);

  const t1 = performance.now();
  logMongoOperation('insertOne', 'investigations', { investigationId }, t1 - t0, 1);
  dbEvents.emit('DB_CHANGE_STREAM', { type: 'INVESTIGATION_CREATED', investigationId });

  return doc;
}

async function getInvestigations(query = {}, sort = { createdAt: -1 }) {
  const db = getDB();
  const t0 = performance.now();

  const mongoQuery = {};
  if (query.status && query.status !== 'ALL') {
    mongoQuery.status = query.status;
  }
  if (query.severity && query.severity !== 'ALL') {
    mongoQuery.severity = query.severity;
  }
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    mongoQuery.$or = [
      { title: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
      { investigationId: { $regex: s, $options: 'i' } },
      { caseId: { $regex: s, $options: 'i' } },
      { threatActor: { $regex: s, $options: 'i' } }
    ];
  }

  const investigations = await db.collection('investigations').find(mongoQuery).sort(sort).toArray();

  // Populate dynamic evidenceCount from evidence collection
  const populated = await Promise.all(investigations.map(async (inv) => {
    const evCount = await db.collection('evidence').countDocuments({
      $or: [
        { investigationId: inv.investigationId },
        { caseId: inv.caseId || inv.investigationId }
      ]
    });
    return {
      ...inv,
      evidenceCount: evCount
    };
  }));

  const t1 = performance.now();
  logMongoOperation('find', 'investigations', mongoQuery, t1 - t0, populated.length);
  return populated;
}

async function getInvestigationById(id) {
  const db = getDB();
  const t0 = performance.now();

  const inv = await db.collection('investigations').findOne({
    $or: [{ investigationId: id }, { caseId: id }]
  });

  if (!inv) return null;

  const evCount = await db.collection('evidence').countDocuments({
    $or: [{ investigationId: inv.investigationId }, { caseId: inv.caseId || inv.investigationId }]
  });

  const t1 = performance.now();
  logMongoOperation('findOne', 'investigations', { id }, t1 - t0, 1);
  return { ...inv, evidenceCount: evCount };
}

async function updateInvestigation(id, updateFields, actor = 'Forensic-Analyst', reason = 'Metadata update') {
  const db = getDB();
  const dbEvents = getDBEvents();
  const t0 = performance.now();

  const cleanUpdate = { ...updateFields, updatedAt: new Date() };
  delete cleanUpdate._id;
  delete cleanUpdate.investigationId;
  delete cleanUpdate.caseId;

  const result = await db.collection('investigations').findOneAndUpdate(
    { $or: [{ investigationId: id }, { caseId: id }] },
    { $set: cleanUpdate },
    { returnDocument: 'after' }
  );

  const updated = result.value || result;

  if (updated) {
    // Keep 'cases' collection in sync
    await db.collection('cases').updateOne(
      { $or: [{ caseId: updated.caseId }, { caseId: updated.investigationId }] },
      { $set: cleanUpdate }
    );

    // Audit log entry
    await db.collection('audit_logs').insertOne({
      logId: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      investigationId: updated.investigationId,
      action: 'UPDATE_INVESTIGATION',
      actor,
      timestamp: new Date(),
      reason,
      changes: cleanUpdate
    });

    dbEvents.emit('DB_CHANGE_STREAM', { type: 'INVESTIGATION_UPDATED', investigationId: updated.investigationId });
  }

  const t1 = performance.now();
  logMongoOperation('findOneAndUpdate', 'investigations', { id, update: cleanUpdate }, t1 - t0, updated ? 1 : 0);
  return updated;
}

async function addInvestigationNote(id, noteText, author = 'Analyst') {
  const db = getDB();
  const t0 = performance.now();

  const note = {
    noteId: `NOTE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    text: noteText,
    author,
    timestamp: new Date()
  };

  const result = await db.collection('investigations').findOneAndUpdate(
    { $or: [{ investigationId: id }, { caseId: id }] },
    { $push: { notes: note }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  await db.collection('audit_logs').insertOne({
    logId: `AUDIT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    investigationId: id,
    action: 'ADD_INVESTIGATION_NOTE',
    actor: author,
    timestamp: new Date(),
    details: { noteId: note.noteId }
  });

  const t1 = performance.now();
  logMongoOperation('updateOne', 'investigations', { id, pushNote: note.noteId }, t1 - t0, 1);
  return note;
}

async function getInvestigationAuditTrail(id = null) {
  const db = getDB();
  const query = (id && id !== 'ALL')
    ? { $or: [{ investigationId: id }, { caseId: id }] }
    : {};
  const logs = await db.collection('audit_logs')
    .find(query)
    .sort({ timestamp: -1 })
    .limit(100)
    .toArray();
  return logs;
}

module.exports = {
  createInvestigation,
  getInvestigations,
  getInvestigationById,
  updateInvestigation,
  addInvestigationNote,
  getInvestigationAuditTrail
};
