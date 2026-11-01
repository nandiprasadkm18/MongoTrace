with open('services/benchmarkService.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace ending lines with validation and normalization
old_tail = '''  // Top-level schema design summaries for easy consumption
  results.embedded = {
    storage: results.storage.embedded,
    reconstruction: results.queryLatency.fullReconstruction.embedded,
    accuracy: results.retrievalAccuracy.embedded
  };
  results.referenced = {
    storage: results.storage.referenced,
    reconstruction: results.queryLatency.fullReconstruction.referenced,
    accuracy: results.retrievalAccuracy.referenced
  };
  results.hybrid = {
    storage: results.storage.hybrid,
    reconstruction: results.queryLatency.fullReconstruction.hybrid,
    accuracy: results.retrievalAccuracy.hybrid
  };

  // Persist experiment run into MongoDB schema_experiments collection
  try {
    const experimentId = `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const experimentDoc = {
      experimentId,
      itemCount: count,
      iterations: effectiveIterations,
      createdAt: new Date(),
      results
    };
    await db.collection('schema_experiments').insertOne(experimentDoc);
    results.experimentId = experimentId;
  } catch (err) {
    console.warn('[Benchmark] Could not persist to schema_experiments:', err.message);
  }

  return results;
}

async function getExperimentHistory() {
  const db = getDB();
  return db.collection('schema_experiments').find({}).sort({ createdAt: -1 }).limit(20).toArray();
}

module.exports = {
  runSchemaBenchmark,
  generateBenchmarkData,
  getExperimentHistory
};'''

new_tail = '''  // Backward-compatibility and cross-version property aliases
  results.queryLatencies = results.queryLatency;
  results.storageFootprint = {
    embedded: {
      dataSizeKB: Number((results.storage.embedded.dataSize / 1024).toFixed(2)),
      storageSizeKB: Number((results.storage.embedded.storageSize / 1024).toFixed(2)),
      indexSizeKB: Number((results.storage.embedded.totalIndexSize / 1024).toFixed(2))
    },
    referenced: {
      dataSizeKB: Number((results.storage.referenced.dataSize / 1024).toFixed(2)),
      storageSizeKB: Number((results.storage.referenced.storageSize / 1024).toFixed(2)),
      indexSizeKB: Number((results.storage.referenced.totalIndexSize / 1024).toFixed(2))
    },
    hybrid: {
      dataSizeKB: Number((results.storage.hybrid.dataSize / 1024).toFixed(2)),
      storageSizeKB: Number((results.storage.hybrid.storageSize / 1024).toFixed(2)),
      indexSizeKB: Number((results.storage.hybrid.totalIndexSize / 1024).toFixed(2))
    }
  };

  // Top-level schema design summaries for easy consumption
  results.embedded = {
    storage: results.storage.embedded,
    reconstruction: results.queryLatency.fullReconstruction.embedded,
    accuracy: results.retrievalAccuracy.embedded
  };
  results.referenced = {
    storage: results.storage.referenced,
    reconstruction: results.queryLatency.fullReconstruction.referenced,
    accuracy: results.retrievalAccuracy.referenced
  };
  results.hybrid = {
    storage: results.storage.hybrid,
    reconstruction: results.queryLatency.fullReconstruction.hybrid,
    accuracy: results.retrievalAccuracy.hybrid
  };

  // Validate results prior to database persistence
  validateBenchmarkResults(results, count);

  // Persist experiment run into MongoDB schema_experiments collection
  try {
    const experimentId = `EXP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const experimentDoc = {
      experimentId,
      itemCount: count,
      iterations: effectiveIterations,
      createdAt: new Date(),
      results
    };
    await db.collection('schema_experiments').insertOne(experimentDoc);
    results.experimentId = experimentId;
  } catch (err) {
    console.warn('[Benchmark] Could not persist to schema_experiments:', err.message);
    throw err;
  }

  return results;
}

/**
 * Validate that benchmark execution results are complete and valid before persistence
 */
function validateBenchmarkResults(results, count) {
  if (!results || typeof results !== 'object') {
    throw new Error('Benchmark validation failed: Results object is null or missing.');
  }

  // 1. Metadata check
  if (!results.metadata || !results.metadata.sampleSize || !results.metadata.iterations) {
    throw new Error('Benchmark validation failed: Missing metadata (sampleSize or iterations).');
  }

  // 2. Storage check
  if (!results.storage || !results.storage.embedded || !results.storage.referenced || !results.storage.hybrid) {
    throw new Error('Benchmark validation failed: Incomplete storage metrics for one or more schema models.');
  }
  for (const model of ['embedded', 'referenced', 'hybrid']) {
    const s = results.storage[model];
    if (s.storageSize === undefined || s.totalIndexSize === undefined) {
      throw new Error(`Benchmark validation failed: Missing storageSize or totalIndexSize for ${model}.`);
    }
  }

  // 3. Query Latency check
  if (!results.queryLatency || !results.queryLatency.fullReconstruction) {
    throw new Error('Benchmark validation failed: Missing fullReconstruction query latency.');
  }

  const recon = results.queryLatency.fullReconstruction;
  if (!recon.referenced || typeof recon.referenced.p50 !== 'number') {
    throw new Error('Benchmark validation failed: Missing p50 reconstruction latency for Referenced schema.');
  }
  if (!recon.hybrid || typeof recon.hybrid.p50 !== 'number') {
    throw new Error('Benchmark validation failed: Missing p50 reconstruction latency for Hybrid schema.');
  }
  if (!results.retrievalAccuracy?.embedded?.limitationTriggered) {
    if (!recon.embedded || typeof recon.embedded.p50 !== 'number') {
      throw new Error('Benchmark validation failed: Missing p50 reconstruction latency for Embedded schema.');
    }
  }

  // 4. Retrieval Accuracy check
  if (!results.retrievalAccuracy || typeof results.retrievalAccuracy.expectedCount !== 'number') {
    throw new Error('Benchmark validation failed: Missing retrievalAccuracy expectedCount.');
  }
  if (typeof results.retrievalAccuracy.referenced?.accuracyPct !== 'number' ||
      typeof results.retrievalAccuracy.hybrid?.accuracyPct !== 'number') {
    throw new Error('Benchmark validation failed: Missing accuracyPct for Referenced or Hybrid models.');
  }

  return true;
}

async function getExperimentHistory() {
  const db = getDB();
  const rawDocs = await db.collection('schema_experiments').find({}).sort({ createdAt: -1 }).limit(20).toArray();

  // Normalize legacy and modern records for seamless frontend consumption
  return rawDocs.map(doc => {
    const res = doc.results || {};

    // Normalize queryLatency and queryLatencies
    const ql = res.queryLatency || res.queryLatencies || {};
    res.queryLatency = ql;
    res.queryLatencies = ql;

    // Normalize storage and storageFootprint
    if (!res.storage && res.storageFootprint) {
      res.storage = {
        embedded: {
          storageSize: Math.round((res.storageFootprint.embedded?.storageSizeKB || 0) * 1024),
          dataSize: Math.round((res.storageFootprint.embedded?.dataSizeKB || 0) * 1024),
          totalIndexSize: Math.round((res.storageFootprint.embedded?.indexSizeKB || 0) * 1024)
        },
        referenced: {
          storageSize: Math.round((res.storageFootprint.referenced?.storageSizeKB || 0) * 1024),
          dataSize: Math.round((res.storageFootprint.referenced?.dataSizeKB || 0) * 1024),
          totalIndexSize: Math.round((res.storageFootprint.referenced?.indexSizeKB || 0) * 1024)
        },
        hybrid: {
          storageSize: Math.round((res.storageFootprint.hybrid?.storageSizeKB || 0) * 1024),
          dataSize: Math.round((res.storageFootprint.hybrid?.dataSizeKB || 0) * 1024),
          totalIndexSize: Math.round((res.storageFootprint.hybrid?.indexSizeKB || 0) * 1024)
        }
      };
    }

    doc.results = res;
    doc.itemCount = doc.itemCount || res.metadata?.sampleSize || res.retrievalAccuracy?.expectedCount || 1000;
    doc.iterations = doc.iterations || res.metadata?.iterations || 15;
    return doc;
  });
}

module.exports = {
  runSchemaBenchmark,
  generateBenchmarkData,
  getExperimentHistory,
  validateBenchmarkResults
};'''

text_norm = text.replace('\r\n', '\n')
old_tail_norm = old_tail.replace('\r\n', '\n')
new_tail_norm = new_tail.replace('\r\n', '\n')

if old_tail_norm in text_norm:
    text_norm = text_norm.replace(old_tail_norm, new_tail_norm)
    with open('services/benchmarkService.js', 'w', encoding='utf-8') as f:
        f.write(text_norm)
    print('BENCHMARK_SERVICE_UPDATED')
else:
    print('TARGET NOT FOUND')

