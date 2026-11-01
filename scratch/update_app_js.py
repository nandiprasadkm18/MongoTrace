with open('public/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_init = '''  document.getElementById('btnToggleEntityView')?.addEventListener('click', () => {
    const graphBox = document.getElementById('entityGraphBox');
    const tableBox = document.getElementById('entityTableContainer');
    const isTable = tableBox.classList.toggle('hidden');
    graphBox.classList.toggle('hidden', !isTable);
  });
}'''

new_init = '''  document.getElementById('btnToggleEntityView')?.addEventListener('click', () => {
    const graphBox = document.getElementById('entityGraphBox');
    const tableBox = document.getElementById('entityTableContainer');
    const isTable = tableBox.classList.toggle('hidden');
    graphBox.classList.toggle('hidden', !isTable);
  });

  // Entity type filter buttons in graph toolbar
  document.querySelectorAll('.graph-floating-bar .pill-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.graph-floating-bar .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const etype = btn.getAttribute('data-etype') || 'ALL';
      appState.selectedEntityType = etype;
      if (appState.graph && typeof appState.graph.setEntityType === 'function') {
        appState.graph.setEntityType(etype);
      }
      renderEntitiesTable(etype);
    });
  });
}'''

text_norm = text.replace('\r\n', '\n')
old_init_norm = old_init.replace('\r\n', '\n')
new_init_norm = new_init.replace('\r\n', '\n')

if old_init_norm in text_norm:
    text_norm = text_norm.replace(old_init_norm, new_init_norm)
    print('INIT_GRAPH_UPDATED')
else:
    print('INIT_GRAPH_NOT_FOUND')

old_load = '''async function loadEntitiesView() {
  const activeInv = appState.currentInvestigationId || 'INV-2026-0881';

  // Load knowledge graph
  try {
    let res = await fetch(`/api/v1/investigations/${activeInv}/reconstruct`);
    if (!res.ok) {
      res = await fetch(`/api/cases/${activeInv}/reconstruct`);
    }
    const data = await res.json();
    const graphData = data.graph || (data.reconstruction && data.reconstruction.graph);
    if (data.success && graphData && appState.graph) {
      if (typeof appState.graph.setData === 'function') {
        appState.graph.setData(graphData);
      } else if (typeof appState.graph.render === 'function') {
        appState.graph.render(graphData);
      }
    }
  } catch (err) {
    console.warn('Graph load warning:', err);
  }

  // Load accessible table
  try {
    const entRes = await fetch(`/api/v1/entities?investigationId=${activeInv}`);
    const entData = await entRes.json();
    const tbody = document.getElementById('entitiesTableBody');
    if (tbody && entData.success) {
      const items = entData.entities || [];
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No entities extracted in this investigation.</td></tr>';
      } else {
        tbody.innerHTML = items.map(ent => `
          <tr>
            <td><span class="badge-tag blue font-mono">${ent.entityType}</span></td>
            <td class="font-mono text-emerald" style="font-weight:600;">${escapeHtml(ent.normalizedValue)}</td>
            <td class="font-mono text-muted text-xs">${new Date(ent.createdAt).toISOString()}</td>
            <td class="font-mono text-muted text-xs">${ent.lastSeen ? new Date(ent.lastSeen).toISOString() : '-'}</td>
            <td class="font-mono">${(ent.evidenceIds || []).length} evidence items</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading entities table:', err);
  }
}'''

new_load = '''async function loadEntitiesView() {
  const activeInv = appState.currentInvestigationId || 'INV-2026-0881';

  // Load knowledge graph
  try {
    let res = await fetch(`/api/v1/investigations/${activeInv}/reconstruct`);
    if (!res.ok) {
      res = await fetch(`/api/cases/${activeInv}/reconstruct`);
    }
    const data = await res.json();
    const graphData = data.graph || (data.reconstruction && data.reconstruction.graph);
    if (data.success && graphData && appState.graph) {
      if (typeof appState.graph.setData === 'function') {
        appState.graph.setData(graphData);
        if (appState.selectedEntityType && typeof appState.graph.setEntityType === 'function') {
          appState.graph.setEntityType(appState.selectedEntityType);
        }
      } else if (typeof appState.graph.render === 'function') {
        appState.graph.render(graphData);
      }
    }
  } catch (err) {
    console.warn('Graph load warning:', err);
  }

  // Load accessible table
  try {
    const entRes = await fetch(`/api/v1/entities?investigationId=${activeInv}`);
    const entData = await entRes.json();
    if (entData.success) {
      appState.allEntities = entData.entities || [];
      renderEntitiesTable(appState.selectedEntityType || 'ALL');
    }
  } catch (err) {
    console.error('Error loading entities table:', err);
  }
}

function renderEntitiesTable(etype = 'ALL') {
  const tbody = document.getElementById('entitiesTableBody');
  if (!tbody) return;
  const filterType = (etype || 'ALL').toUpperCase();
  const allItems = appState.allEntities || [];

  const items = allItems.filter(ent => {
    if (filterType === 'ALL') return true;
    if (filterType === 'FILE') return ent.entityType === 'FILE' || ent.entityType === 'HASH';
    return ent.entityType === filterType;
  });

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No ${filterType === 'ALL' ? '' : filterType + ' '}entities extracted in this investigation.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(ent => `
    <tr>
      <td><span class="badge-tag blue font-mono">${ent.entityType}</span></td>
      <td class="font-mono text-emerald" style="font-weight:600;">${escapeHtml(ent.normalizedValue || ent.value)}</td>
      <td class="font-mono text-muted text-xs">${ent.createdAt ? new Date(ent.createdAt).toISOString() : '-'}</td>
      <td class="font-mono text-muted text-xs">${ent.lastSeen ? new Date(ent.lastSeen).toISOString() : '-'}</td>
      <td class="font-mono">${(ent.evidenceIds || []).length} evidence items</td>
    </tr>
  `).join('');
}'''

old_load_norm = old_load.replace('\r\n', '\n')
new_load_norm = new_load.replace('\r\n', '\n')

if old_load_norm in text_norm:
    text_norm = text_norm.replace(old_load_norm, new_load_norm)
    print('LOAD_ENTITIES_UPDATED')
else:
    print('LOAD_ENTITIES_NOT_FOUND')

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(text_norm)
