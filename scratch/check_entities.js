const { MongoClient } = require('mongodb');
async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('mongotrace');
  
  const totalEntities = await db.collection('entities').countDocuments();
  console.log('Total entities collection docs:', totalEntities);
  
  const allInvEntities = await db.collection('entities').distinct('investigationId');
  console.log('InvestigationIds in entities collection:', JSON.stringify(allInvEntities));
  
  // Check embedded entities on evidence docs
  const ev = await db.collection('evidence').findOne({ investigationId: 'INV-2026-0881' });
  console.log('Sample evidence has entities array?', Array.isArray(ev && ev.entities));
  console.log('Sample evidence entities (first 3):', JSON.stringify((ev && ev.entities || []).slice(0, 3)));
  
  // Count evidence that has a non-empty entities array
  const allEv = await db.collection('evidence').find({ investigationId: 'INV-2026-0881' }).toArray();
  const withEnt = allEv.filter(e => Array.isArray(e.entities) && e.entities.length > 0);
  console.log('Evidence with entities for INV-2026-0881:', withEnt.length, '/', allEv.length);
  
  await client.close();
}
main().catch(console.error);

