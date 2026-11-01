with open('public/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_block = '''async function loadExperimentsView() {
  try {
    const res = await fetch('/api/v1/experiments');
    const data = await res.json();
    const tbody = document.getElementById('experimentsHistoryTableBody');
    if (tbody && data.success) {
      const history = data.experiments || [];
      if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No benchmark experiments recorded.</td></tr>';
      } else {
        tbody.innerHTML = history.map(exp => {
          const res = exp.results || {};
          const recon = (res.queryLatencies && res.queryLatencies.fullReconstruction) || {};
          return `
            <tr>
              <td class="font-mono text-emerald">${escapeHtml(exp.experimentId)}</td>
              <td class="font-mono">${exp.itemCount}</td>
              <td class="font-mono">${exp.iterations}</td>
              <td class="font-mono">${(recon.embedded && recon.embedded.p50) || '-'}ms</td>
              <td class="font-mono">${(recon.referenced && recon.referenced.p50) || '-'}ms</td>
              <td class="font-mono text-emerald" style="font-weight:700;">${(recon.hybrid && recon.hybrid.p50) || '-'}ms</td>
              <td class="font-mono text-emerald">100%</td>
              <td class="font-mono text-muted text-xs">${new Date(exp.createdAt).toISOString()}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading experiments view:', err);
  }
}

document.getElementById('btnRunBenchmark')?.addEventListener('click', async () => {
  const itemCount = document.getElementById('benchItemCount').value;
  const iterations = document.getElementById('benchIterations').value;
  const loading = document.getElementById('benchmarkLoading');

  try {
    loading.classList.remove('hidden');
    const res = await fetch('/api/v1/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCount, iterations })
    });
    const data = await res.json();
    loading.classList.add('hidden');

    if (!data.success) throw new Error(data.error);

    const b = data.experiment;

    // Update Model Cards
    document.getElementById('embStorageSize').textContent = `${Math.round((b.storage?.embedded?.storageSize || 0) / 1024)} KB`;
    document.getElementById('embIndexSize').textContent = `${Math.round((b.storage?.embedded?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('embReconLat').textContent = `${b.queryLatency?.fullReconstruction?.embedded?.p50 || 0}ms`;
    document.getElementById('embUpdateLat').textContent = `${b.queryLatency?.singleItemUpdate?.embedded?.p50 || 0}ms`;
    document.getElementById('embAccuracy').textContent = `${b.retrievalAccuracy?.embedded?.accuracyPct || 100}%`;

    document.getElementById('refStorageSize').textContent = `${Math.round((b.storage?.referenced?.storageSize || 0) / 1024)} KB`;
    document.getElementById('refIndexSize').textContent = `${Math.round((b.storage?.referenced?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('refReconLat').textContent = `${b.queryLatency?.fullReconstruction?.referenced?.p50 || 0}ms`;
    document.getElementById('refUpdateLat').textContent = `${b.queryLatency?.singleItemUpdate?.referenced?.p50 || 0}ms`;
    document.getElementById('refAccuracy').textContent = `${b.retrievalAccuracy?.referenced?.accuracyPct || 100}%`;

    document.getElementById('hybStorageSize').textContent = `${Math.round((b.storage?.hybrid?.storageSize || 0) / 1024)} KB`;
    document.getElementById('hybIndexSize').textContent = `${Math.round((b.storage?.hybrid?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('hybReconLat').textContent = `${b.queryLatency?.fullReconstruction?.hybrid?.p50 || 0}ms`;
    document.getElementById('hybUpdateLat').textContent = `${b.queryLatency?.singleItemUpdate?.hybrid?.p50 || 0}ms`;
    document.getElementById('hybAccuracy').textContent = `${b.retrievalAccuracy?.hybrid?.accuracyPct || 100}%`;

    // Render Charts
    if (typeof renderBenchmarkCharts === 'function') {
      renderBenchmarkCharts(b);
    }

    // Populate Latency Matrix
    populateLatencyMatrix(b);
    await loadExperimentsView();
  } catch (err) {
    loading.classList.add('hidden');
    alert('Benchmark execution error: ' + err.message);
  }
});

function populateLatencyMatrix(b) {
  const tbody = document.getElementById('benchMatrixTableBody');
  if (!tbody || !b.queryLatency) return;

  const rows = [
    { op: 'Full Incident Reconstruction', model: 'Embedded Document', data: b.queryLatency.fullReconstruction?.embedded, acc: b.retrievalAccuracy?.embedded?.accuracyPct },
    { op: 'Full Incident Reconstruction', model: 'Referenced / Normalized', data: b.queryLatency.fullReconstruction?.referenced, acc: b.retrievalAccuracy?.referenced?.accuracyPct },
    { op: 'Full Incident Reconstruction', model: 'Hybrid Time-Bucket', data: b.queryLatency.fullReconstruction?.hybrid, acc: b.retrievalAccuracy?.hybrid?.accuracyPct },
    { op: 'Single Evidence Update', model: 'Embedded Document', data: b.queryLatency.singleItemUpdate?.embedded, acc: '100%' },
    { op: 'Single Evidence Update', model: 'Referenced / Normalized', data: b.queryLatency.singleItemUpdate?.referenced, acc: '100%' },
    { op: 'Single Evidence Update', model: 'Hybrid Time-Bucket', data: b.queryLatency.singleItemUpdate?.hybrid, acc: '100%' }
  ];

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.op}</strong></td>
      <td class="font-mono text-xs">${r.model}</td>
      <td class="font-mono">${r.data?.min || 0}ms</td>
      <td class="font-mono" style="font-weight:700;">${r.data?.p50 || 0}ms</td>
      <td class="font-mono">${r.data?.p95 || 0}ms</td>
      <td class="font-mono">${r.data?.p99 || 0}ms</td>
      <td class="font-mono">${r.data?.max || 0}ms</td>
      <td class="font-mono text-emerald">${r.acc || '100%'}</td>
    </tr>
  `).join('');
}'''

new_block = '''async function loadExperimentsView() {
  try {
    const res = await fetch('/api/v1/experiments');
    const data = await res.json();
    const tbody = document.getElementById('experimentsHistoryTableBody');
    if (tbody && data.success) {
      const history = data.experiments || [];
      if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No benchmark experiments recorded.</td></tr>';
      } else {
        tbody.innerHTML = history.map(exp => {
          const res = exp.results || {};
          // Support both queryLatency (standard) and legacy queryLatencies
          const ql = res.queryLatency || res.queryLatencies || {};
          const recon = ql.fullReconstruction || {};
          const accuracy = res.retrievalAccuracy || {};

          // Embedded latency & status
          const embLimited = accuracy.embedded?.limitationTriggered || (res.ingestion?.embedded?.error != null);
          let embDisplay = '-';
          if (embLimited) {
            embDisplay = '<span class="text-danger" style="font-weight:600;" title="16MB BSON barrier triggered">N/A (16MB)</span>';
          } else if (recon.embedded && typeof recon.embedded.p50 === 'number') {
            embDisplay = `${Number(recon.embedded.p50).toFixed(2)}ms`;
          }

          // Referenced latency
          let refDisplay = '-';
          if (recon.referenced && typeof recon.referenced.p50 === 'number') {
            refDisplay = `${Number(recon.referenced.p50).toFixed(2)}ms`;
          }

          // Hybrid latency
          let hybDisplay = '-';
          if (recon.hybrid && typeof recon.hybrid.p50 === 'number') {
            hybDisplay = `<span class="text-emerald" style="font-weight:700;">${Number(recon.hybrid.p50).toFixed(2)}ms</span>`;
          }

          // Dynamic Accuracy Summary
          let accDisplay = '100%';
          if (embLimited) {
            accDisplay = '<span class="text-amber" title="Referenced/Hybrid: 100%, Embedded: Exceeded 16MB">Partial (Ref/Hyb 100%)</span>';
          } else if (accuracy.referenced?.accuracyPct != null) {
            accDisplay = `<span class="text-emerald">${accuracy.referenced.accuracyPct}%</span>`;
          }

          const itemCount = exp.itemCount || res.metadata?.sampleSize || 1000;
          const iterations = exp.iterations || res.metadata?.iterations || 15;
          const expDate = exp.createdAt ? new Date(exp.createdAt).toISOString().replace('T', ' ').substring(0, 19) : '-';

          return `
            <tr>
              <td class="font-mono text-emerald" style="font-weight:600;">${escapeHtml(exp.experimentId || '-')}</td>
              <td class="font-mono">${Number(itemCount).toLocaleString()}</td>
              <td class="font-mono">${iterations}</td>
              <td class="font-mono">${embDisplay}</td>
              <td class="font-mono">${refDisplay}</td>
              <td class="font-mono">${hybDisplay}</td>
              <td class="font-mono">${accDisplay}</td>
              <td class="font-mono text-muted text-xs">${expDate}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading experiments view:', err);
  }
}

document.getElementById('btnRunBenchmark')?.addEventListener('click', async () => {
  const itemCount = document.getElementById('benchItemCount').value;
  const iterations = document.getElementById('benchIterations').value;
  const loading = document.getElementById('benchmarkLoading');

  try {
    loading.classList.remove('hidden');
    const res = await fetch('/api/v1/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemCount, iterations })
    });
    const data = await res.json();
    loading.classList.add('hidden');

    if (!data.success) throw new Error(data.error);

    const b = data.experiment;
    const ql = b.queryLatency || b.queryLatencies || {};
    const embLimited = b.retrievalAccuracy?.embedded?.limitationTriggered || (b.ingestion?.embedded?.error != null);

    // Update Model Cards with bounds checking
    document.getElementById('embStorageSize').textContent = `${Math.round((b.storage?.embedded?.storageSize || 0) / 1024)} KB`;
    document.getElementById('embIndexSize').textContent = `${Math.round((b.storage?.embedded?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('embReconLat').textContent = embLimited ? 'N/A (16MB)' : (ql.fullReconstruction?.embedded?.p50 != null ? `${Number(ql.fullReconstruction.embedded.p50).toFixed(2)}ms` : '-');
    document.getElementById('embUpdateLat').textContent = embLimited ? 'N/A (16MB)' : (ql.singleItemUpdate?.embedded?.p50 != null ? `${Number(ql.singleItemUpdate.embedded.p50).toFixed(2)}ms` : '-');
    document.getElementById('embAccuracy').textContent = embLimited ? '0% (Exceeded)' : `${b.retrievalAccuracy?.embedded?.accuracyPct || 100}%`;

    document.getElementById('refStorageSize').textContent = `${Math.round((b.storage?.referenced?.storageSize || 0) / 1024)} KB`;
    document.getElementById('refIndexSize').textContent = `${Math.round((b.storage?.referenced?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('refReconLat').textContent = ql.fullReconstruction?.referenced?.p50 != null ? `${Number(ql.fullReconstruction.referenced.p50).toFixed(2)}ms` : '-';
    document.getElementById('refUpdateLat').textContent = ql.singleItemUpdate?.referenced?.p50 != null ? `${Number(ql.singleItemUpdate.referenced.p50).toFixed(2)}ms` : '-';
    document.getElementById('refAccuracy').textContent = `${b.retrievalAccuracy?.referenced?.accuracyPct || 100}%`;

    document.getElementById('hybStorageSize').textContent = `${Math.round((b.storage?.hybrid?.storageSize || 0) / 1024)} KB`;
    document.getElementById('hybIndexSize').textContent = `${Math.round((b.storage?.hybrid?.totalIndexSize || 0) / 1024)} KB`;
    document.getElementById('hybReconLat').textContent = ql.fullReconstruction?.hybrid?.p50 != null ? `${Number(ql.fullReconstruction.hybrid.p50).toFixed(2)}ms` : '-';
    document.getElementById('hybUpdateLat').textContent = ql.singleItemUpdate?.hybrid?.p50 != null ? `${Number(ql.singleItemUpdate.hybrid.p50).toFixed(2)}ms` : '-';
    document.getElementById('hybAccuracy').textContent = `${b.retrievalAccuracy?.hybrid?.accuracyPct || 100}%`;

    // Render Charts
    if (typeof renderBenchmarkCharts === 'function') {
      renderBenchmarkCharts(b);
    }

    // Populate Latency Matrix
    populateLatencyMatrix(b);
    await loadExperimentsView();
  } catch (err) {
    loading.classList.add('hidden');
    alert('Benchmark execution error: ' + err.message);
  }
});

function populateLatencyMatrix(b) {
  const tbody = document.getElementById('benchMatrixTableBody');
  const ql = b.queryLatency || b.queryLatencies;
  if (!tbody || !ql) return;

  const embLimited = b.retrievalAccuracy?.embedded?.limitationTriggered || (b.ingestion?.embedded?.error != null);

  const rows = [
    { op: 'Full Incident Reconstruction', model: 'Embedded Document', data: ql.fullReconstruction?.embedded, acc: embLimited ? '0%' : `${b.retrievalAccuracy?.embedded?.accuracyPct || 100}%`, limited: embLimited },
    { op: 'Full Incident Reconstruction', model: 'Referenced / Normalized', data: ql.fullReconstruction?.referenced, acc: `${b.retrievalAccuracy?.referenced?.accuracyPct || 100}%` },
    { op: 'Full Incident Reconstruction', model: 'Hybrid Time-Bucket', data: ql.fullReconstruction?.hybrid, acc: `${b.retrievalAccuracy?.hybrid?.accuracyPct || 100}%` },
    { op: 'Time-Window Temporal Filter', model: 'Embedded Document', data: ql.timeWindowRange?.embedded, acc: embLimited ? '0%' : '100%', limited: embLimited },
    { op: 'Time-Window Temporal Filter', model: 'Referenced / Normalized', data: ql.timeWindowRange?.referenced, acc: '100%' },
    { op: 'Time-Window Temporal Filter', model: 'Hybrid Time-Bucket', data: ql.timeWindowRange?.hybrid, acc: '100%' },
    { op: 'Single Evidence Update', model: 'Embedded Document', data: ql.singleItemUpdate?.embedded, acc: embLimited ? '0%' : '100%', limited: embLimited },
    { op: 'Single Evidence Update', model: 'Referenced / Normalized', data: ql.singleItemUpdate?.referenced, acc: '100%' },
    { op: 'Single Evidence Update', model: 'Hybrid Time-Bucket', data: ql.singleItemUpdate?.hybrid, acc: '100%' }
  ];

  tbody.innerHTML = rows.map(r => {
    const isNA = r.limited || !r.data;
    const minVal = isNA ? 'N/A' : `${Number(r.data.min).toFixed(2)}ms`;
    const p50Val = isNA ? '<span class="text-danger">N/A (16MB)</span>' : `${Number(r.data.p50).toFixed(2)}ms`;
    const p95Val = isNA ? 'N/A' : `${Number(r.data.p95).toFixed(2)}ms`;
    const p99Val = isNA ? 'N/A' : `${Number(r.data.p99).toFixed(2)}ms`;
    const maxVal = isNA ? 'N/A' : `${Number(r.data.max).toFixed(2)}ms`;
    const accClass = r.limited ? 'text-danger' : 'text-emerald';

    return `
      <tr>
        <td><strong>${r.op}</strong></td>
        <td class="font-mono text-xs">${r.model}</td>
        <td class="font-mono">${minVal}</td>
        <td class="font-mono" style="font-weight:700;">${p50Val}</td>
        <td class="font-mono">${p95Val}</td>
        <td class="font-mono">${p99Val}</td>
        <td class="font-mono">${maxVal}</td>
        <td class="font-mono ${accClass}">${r.acc}</td>
      </tr>
    `;
  }).join('');
}'''

text_norm = text.replace('\r\n', '\n')
old_block_norm = old_block.replace('\r\n', '\n')
new_block_norm = new_block.replace('\r\n', '\n')

if old_block_norm in text_norm:
    text_norm = text_norm.replace(old_block_norm, new_block_norm)
    with open('public/app.js', 'w', encoding='utf-8') as f:
        f.write(text_norm)
    print('APP_JS_UPDATED')
else:
    print('APP_JS_BLOCK_NOT_FOUND')

