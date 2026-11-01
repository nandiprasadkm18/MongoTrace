with open('tests/run_tests.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_import = "const { runSchemaBenchmark } = require('../services/benchmarkService');"
new_import = "const { runSchemaBenchmark, getExperimentHistory, validateBenchmarkResults } = require('../services/benchmarkService');"

old_tail = '''        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', false, err.message, performance.now() - t0);
      }
    }

    // Clean up test database'''

new_tail = '''        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', false, err.message, performance.now() - t0);
      }
    }

    // -------------------------------------------------------------
    // Test 27: Schema Experiments Persistence Integrity & Metrics Validation
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        // 1. Run 1,000 item benchmark
        const bench = await runSchemaBenchmark(1000, 3);
        if (!bench.experimentId) {
          throw new Error('Benchmark result must contain an assigned experimentId');
        }

        // Verify all 3 models have storage metrics
        for (const m of ['embedded', 'referenced', 'hybrid']) {
          if (typeof bench.storage[m]?.storageSize !== 'number' || typeof bench.storage[m]?.totalIndexSize !== 'number') {
            throw new Error(`Model ${m} missing storageSize or totalIndexSize metrics`);
          }
          // Verify percentiles (min, p50, p95, p99, max)
          const recon = bench.queryLatency.fullReconstruction[m];
          if (!recon || typeof recon.p50 !== 'number' || typeof recon.min !== 'number' || typeof recon.max !== 'number') {
            throw new Error(`Model ${m} missing complete percentiles in fullReconstruction`);
          }
          const range = bench.queryLatency.timeWindowRange[m];
          if (!range || typeof range.p50 !== 'number') {
            throw new Error(`Model ${m} missing timeWindowRange percentiles`);
          }
          const update = bench.queryLatency.singleItemUpdate[m];
          if (!update || typeof update.p50 !== 'number') {
            throw new Error(`Model ${m} missing singleItemUpdate percentiles`);
          }
        }

        // Verify backward-compatibility aliases
        if (!bench.queryLatencies || !bench.storageFootprint) {
          throw new Error('Benchmark result missing backward-compatible queryLatencies or storageFootprint aliases');
        }

        // 2. Verify MongoDB schema_experiments persistence
        const savedDoc = await db.collection('schema_experiments').findOne({ experimentId: bench.experimentId });
        if (!savedDoc) {
          throw new Error(`Document ${bench.experimentId} not found in schema_experiments collection`);
        }
        if (savedDoc.itemCount !== 1000 || savedDoc.iterations !== 3) {
          throw new Error('Saved document itemCount or iterations mismatch');
        }
        if (typeof savedDoc.results.queryLatency.fullReconstruction.embedded.p50 !== 'number' ||
            typeof savedDoc.results.queryLatency.fullReconstruction.referenced.p50 !== 'number' ||
            typeof savedDoc.results.queryLatency.fullReconstruction.hybrid.p50 !== 'number') {
          throw new Error('Saved document missing p50 latency numbers for one or more schema models');
        }

        // 3. Verify getExperimentHistory retrieval & normalization
        const history = await getExperimentHistory();
        if (!Array.isArray(history) || history.length === 0) {
          throw new Error('getExperimentHistory must return non-empty array of experiments');
        }
        const found = history.find(e => e.experimentId === bench.experimentId);
        if (!found) {
          throw new Error('Newly persisted experiment not retrieved by getExperimentHistory()');
        }
        if (typeof found.results.queryLatency.fullReconstruction.embedded.p50 !== 'number' ||
            typeof found.results.queryLatencies.fullReconstruction.embedded.p50 !== 'number') {
          throw new Error('getExperimentHistory failed to expose normalized p50 values on both queryLatency and queryLatencies');
        }

        // 4. Verify validation logic rejects corrupted or incomplete benchmark results
        let rejectedMissing = false;
        try {
          validateBenchmarkResults({ metadata: { sampleSize: 1000 } }, 1000);
        } catch (vErr) {
          rejectedMissing = true;
        }
        if (!rejectedMissing) {
          throw new Error('validateBenchmarkResults must throw error for incomplete results');
        }

        let rejectedNullP50 = false;
        try {
          validateBenchmarkResults({
            metadata: { sampleSize: 1000, iterations: 5 },
            storage: { embedded: { storageSize: 100, totalIndexSize: 0 }, referenced: { storageSize: 200, totalIndexSize: 10 }, hybrid: { storageSize: 150, totalIndexSize: 10 } },
            queryLatency: { fullReconstruction: { embedded: null, referenced: { p50: 10 }, hybrid: { p50: 10 } } },
            retrievalAccuracy: { expectedCount: 1000, referenced: { accuracyPct: 100 }, hybrid: { accuracyPct: 100 } }
          }, 1000);
        } catch (vErr) {
          rejectedNullP50 = true;
        }
        if (!rejectedNullP50) {
          throw new Error('validateBenchmarkResults must reject null p50 when limitation is not triggered');
        }

        recordResult('27. [Benchmark] Schema Experiments Retrieval & Complete Metric Persistence Integrity', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('27. [Benchmark] Schema Experiments Retrieval & Complete Metric Persistence Integrity', false, err.message, performance.now() - t0);
      }
    }

    // Clean up test database'''

text_norm = text.replace('\r\n', '\n')
old_import_norm = old_import.replace('\r\n', '\n')
new_import_norm = new_import.replace('\r\n', '\n')
old_tail_norm = old_tail.replace('\r\n', '\n')
new_tail_norm = new_tail.replace('\r\n', '\n')

if old_import_norm in text_norm and old_tail_norm in text_norm:
    text_norm = text_norm.replace(old_import_norm, new_import_norm)
    text_norm = text_norm.replace(old_tail_norm, new_tail_norm)
    with open('tests/run_tests.js', 'w', encoding='utf-8') as f:
        f.write(text_norm)
    print('TESTS_UPDATED')
else:
    print('TARGETS NOT FOUND')

