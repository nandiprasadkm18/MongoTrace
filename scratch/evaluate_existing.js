const { connectDB, getDB } = require('../services/db');
const { evaluateInvestigationWithML, getMLStats } = require('../services/mlService');

(async () => {
  await connectDB();
  const db = getDB();
  const invs = await db.collection('investigations').find().toArray();
  console.log('Found investigations:', invs.map(i => i.investigationId || i.caseId));

  for (const inv of invs) {
    const id = inv.investigationId || inv.caseId;
    const res = await evaluateInvestigationWithML(id);
    console.log(`Evaluated ${id}: count=${res.evaluatedCount}, anomalies=${res.anomaliesFound}`);
  }

  const stats = await getMLStats();
  console.log('Overall ML Stats in mongotrace:', JSON.stringify(stats, null, 2));

  const sampleDetections = await db.collection('ml_detections').find().limit(3).toArray();
  console.log('Sample persisted detections:', JSON.stringify(sampleDetections, null, 2));

  process.exit(0);
})();
