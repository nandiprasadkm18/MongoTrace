with open('tests/run_tests.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = "recordResult('25. [ML] Persistence of ML Findings in ml_detections & Aggregation Statistics', true, null, performance.now() - t0);\n      } catch (err) {\n        recordResult('25. [ML] Persistence of ML Findings in ml_detections & Aggregation Statistics', false, err.message, performance.now() - t0);\n      }\n    }"

if target not in content:
    target = "recordResult('25. [ML] Persistence of ML Findings in ml_detections & Aggregation Statistics', true, null, performance.now() - t0);\r\n      } catch (err) {\r\n        recordResult('25. [ML] Persistence of ML Findings in ml_detections & Aggregation Statistics', false, err.message, performance.now() - t0);\r\n      }\r\n    }"

assert target in content, "target for test 25 not found"

test26_code = """

    // -------------------------------------------------------------
    // Test 26: NoSQL Scalability & 16MB Boundary Benchmark Experiment
    // -------------------------------------------------------------
    {
      const t0 = performance.now();
      try {
        // Run 1,000 item multi-model benchmark
        const res1k = await runSchemaBenchmark(1000, 3);
        if (!res1k.storage || !res1k.queryLatency || !res1k.retrievalAccuracy) {
          throw new Error('Benchmark result missing required sections');
        }

        // Verify percentile calculation
        const refLat = res1k.queryLatency.fullReconstruction.referenced;
        if (!refLat || typeof refLat.p50 !== 'number' || typeof refLat.p95 !== 'number' || typeof refLat.p99 !== 'number') {
          throw new Error('Referenced query latency missing p50, p95, or p99 percentiles');
        }

        // Run boundary limit verification (>16MB BSON limit)
        const resBoundary = await runSchemaBenchmark(25000, 1);
        if (!resBoundary.retrievalAccuracy.embedded.limitationTriggered) {
          throw new Error('Expected 16MB limitation to trigger for 25,000 embedded items');
        }
        if (resBoundary.retrievalAccuracy.referenced.accuracyPct !== 100 || resBoundary.retrievalAccuracy.hybrid.accuracyPct !== 100) {
          throw new Error('Referenced and Hybrid models must achieve 100% retrieval accuracy at scale');
        }

        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', true, null, performance.now() - t0);
      } catch (err) {
        recordResult('26. [Scalability] NoSQL Multi-Model Benchmark (1K scale & 16MB boundary limit handling)', false, err.message, performance.now() - t0);
      }
    }"""

content = content.replace(target, target + test26_code, 1)

with open('tests/run_tests.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Added Test 26 to tests/run_tests.js successfully!")

