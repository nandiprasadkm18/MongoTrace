with open('server.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_exp = '''// Schema Experiments
app.post('/api/v1/experiments', async (req, res) => {
  try {
    const itemCount = parseInt(req.body.itemCount || '1500', 10);
    const iterations = parseInt(req.body.iterations || '10', 10);
    const benchmarkResult = await runSchemaBenchmark(itemCount, iterations);
    res.json({ success: true, experiment: benchmarkResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});'''

new_exp = '''// Schema Experiments
app.post('/api/v1/experiments', async (req, res) => {
  try {
    const itemCount = parseInt(req.body.itemCount || '1000', 10);
    const iterations = parseInt(req.body.iterations || '15', 10);
    if (isNaN(itemCount) || itemCount < 100 || itemCount > 100000) {
      return res.status(400).json({ success: false, error: 'itemCount must be an integer between 100 and 100,000' });
    }
    if (isNaN(iterations) || iterations < 1 || iterations > 100) {
      return res.status(400).json({ success: false, error: 'iterations must be an integer between 1 and 100' });
    }
    const benchmarkResult = await runSchemaBenchmark(itemCount, iterations);
    res.json({ success: true, experiment: benchmarkResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});'''

old_bench = '''app.post('/api/benchmark/run', async (req, res) => {
  try {
    const itemCount = parseInt(req.body.itemCount || '1500', 10);
    const iterations = parseInt(req.body.iterations || '10', 10);
    const benchmarkResult = await runSchemaBenchmark(itemCount, iterations);
    res.json({ success: true, benchmark: benchmarkResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});'''

new_bench = '''app.post('/api/benchmark/run', async (req, res) => {
  try {
    const itemCount = parseInt(req.body.itemCount || '1000', 10);
    const iterations = parseInt(req.body.iterations || '15', 10);
    if (isNaN(itemCount) || itemCount < 100 || itemCount > 100000) {
      return res.status(400).json({ success: false, error: 'itemCount must be an integer between 100 and 100,000' });
    }
    if (isNaN(iterations) || iterations < 1 || iterations > 100) {
      return res.status(400).json({ success: false, error: 'iterations must be an integer between 1 and 100' });
    }
    const benchmarkResult = await runSchemaBenchmark(itemCount, iterations);
    res.json({ success: true, benchmark: benchmarkResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});'''

text_norm = text.replace('\r\n', '\n')
old_exp_norm = old_exp.replace('\r\n', '\n')
new_exp_norm = new_exp.replace('\r\n', '\n')
old_bench_norm = old_bench.replace('\r\n', '\n')
new_bench_norm = new_bench.replace('\r\n', '\n')

if old_exp_norm in text_norm and old_bench_norm in text_norm:
    text_norm = text_norm.replace(old_exp_norm, new_exp_norm)
    text_norm = text_norm.replace(old_bench_norm, new_bench_norm)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(text_norm)
    print('SERVER_JS_UPDATED')
else:
    print('SERVER_TARGET_NOT_FOUND')

