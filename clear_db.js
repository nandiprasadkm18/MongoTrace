/**
 * MongoTrace Database Purge & Reset Utility
 * Clears all stored digital forensic evidence, ML detections, audit logs,
 * GridFS files, and benchmark tables, restoring a completely clean database.
 */

const { MongoClient, GridFSBucket } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'mongotrace';

async function clearDatabase() {
  console.log('===============================================================');
  console.log(` MongoTrace Database Purge Utility`);
  console.log(` Target Database: ${MONGO_URI}/${DB_NAME}`);
  console.log('===============================================================\n');

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const collectionsToPurge = [
      'evidence',
      'evidence_versions',
      'chain_of_custody',
      'evidence_relations',
      'investigations',
      'cases',
      'entities',
      'relationships',
      'ml_detections',
      'derived_findings',
      'detection_rules',
      'ingestion_jobs',
      'audit_logs',
      'schema_experiments',
      'schema_bench_referenced_items',
      'schema_bench_referenced_cases',
      'schema_bench_hybrid',
      'schema_bench_embedded',
      'evidence_vault.files',
      'evidence_vault.chunks'
    ];

    let totalDeleted = 0;
    console.log('[Purge] Clearing stored collections:');

    for (const colName of collectionsToPurge) {
      try {
        const result = await db.collection(colName).deleteMany({});
        if (result.deletedCount > 0) {
          console.log(`  ✓ ${colName.padEnd(30)}: Deleted ${result.deletedCount} records`);
          totalDeleted += result.deletedCount;
        } else {
          console.log(`  - ${colName.padEnd(30)}: Already empty (0 records)`);
        }
      } catch (err) {
        // If collection doesn't exist, ignore
      }
    }

    console.log('\n===============================================================');
    console.log(` Purge Complete: Removed ${totalDeleted} records across all collections.`);
    console.log(` Database '${DB_NAME}' is now completely clean and ready.`);
    console.log('===============================================================\n');

  } catch (err) {
    console.error('[Error during purge]:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

clearDatabase();

