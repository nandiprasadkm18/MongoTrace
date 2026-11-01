const { MongoClient } = require('mongodb');
async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('mongotrace');
  
  // Check entities collection structure
  const sample = await db.collection('entities').find({}).limit(3).toArray();
  console.log('Sample entities docs:');
  sample.forEach(e => {
    console.log(JSON.stringify({ 
      _id: e._id.toString().substring(0,8),
      entityId: e.entityId,
      entityType: e.entityType,
      investigationId: e.investigationId,
      value: e.value,
      normalizedValue: e.normalizedValue
    }));
  });
  
  // Check how many have investigationId set
  const withInvId = await db.collection('entities').countDocuments({ investigationId: { $exists: true, $ne: null, $ne: '' } });
  console.log('Entities with investigationId:', withInvId);
  
  // Check reconstruct API response shape
  // Also check the /api/v1/entities endpoint in server.js
  await client.close();
}
main().catch(console.error);

