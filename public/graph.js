/**
 * MongoTrace Clean Enterprise Force-Directed Evidence Knowledge Graph
 */
class EvidenceGraph {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.onNodeClick = options.onNodeClick || (() => {});
    this.svg = null;
    this.g = null;
    this.simulation = null;
    this.zoom = null;
    this.data = { nodes: [], edges: [] };
    this.filterSeverity = 'ALL';
    this.filterArtifact = 'ALL';
    this.filterEntityType = 'ALL';
    this.isKillChainHighlighted = false;

    this.init();
  }

  init() {
    this.container.innerHTML = '';
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height]);

    const defs = this.svg.append('defs');

    // Clean Arrowhead Markers
    defs.append('marker')
      .attr('id', 'arrow-causal')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#dc2626');

    defs.append('marker')
      .attr('id', 'arrow-standard')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#94a3b8');

    this.g = this.svg.append('g');

    this.zoom = d3.zoom()
      .scaleExtent([0.2, 3.5])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);
  }

  setData(graphData) {
    this.rawNodes = JSON.parse(JSON.stringify(graphData.nodes || []));
    this.rawEdges = JSON.parse(JSON.stringify(graphData.edges || []));
    this.applyFilters();
  }

  setFilters(severity, artifact) {
    this.filterSeverity = severity;
    this.filterArtifact = artifact;
    this.applyFilters();
  }

  setEntityType(entityType) {
    this.filterEntityType = (entityType || 'ALL').toUpperCase();
    this.applyFilters();
  }

  applyFilters() {
    if (!this.rawNodes) return;

    const eFilter = (this.filterEntityType || 'ALL').toUpperCase();

    // 1. Evidence filtering by severity and artifactType
    let baseNodes = this.rawNodes.filter(node => {
      if (node.type === 'EVIDENCE') {
        if (this.filterSeverity !== 'ALL' && node.severity !== this.filterSeverity) return false;
        if (this.filterArtifact !== 'ALL' && node.artifactType !== this.filterArtifact) return false;
      }
      return true;
    });

    // 2. Entity filtering by entity type (HOST, USER, IP, PROCESS, FILE/HASH)
    let finalNodes = [];
    if (eFilter === 'ALL') {
      finalNodes = baseNodes;
    } else {
      const matchTypes = new Set();
      if (eFilter === 'FILE') {
        matchTypes.add('FILE');
        matchTypes.add('HASH');
      } else {
        matchTypes.add(eFilter);
      }

      // Collect IDs of entities matching the chosen type
      const targetEntityIds = new Set(
        baseNodes.filter(n => matchTypes.has(n.type)).map(n => n.id)
      );

      // Collect evidence IDs directly linked to these entities
      const linkedEvidenceIds = new Set();
      this.rawEdges.forEach(e => {
        const sId = e.source.id || e.source;
        const tId = e.target.id || e.target;
        if (targetEntityIds.has(sId)) linkedEvidenceIds.add(tId);
        if (targetEntityIds.has(tId)) linkedEvidenceIds.add(sId);
      });

      // Keep matching entity nodes AND their directly linked evidence nodes
      finalNodes = baseNodes.filter(n => {
        if (matchTypes.has(n.type)) return true;
        if (n.type === 'EVIDENCE' && linkedEvidenceIds.has(n.id)) return true;
        return false;
      });
    }

    const activeNodeIds = new Set(finalNodes.map(n => n.id));
    const filteredEdges = this.rawEdges.filter(e => 
      activeNodeIds.has(e.source.id || e.source) && activeNodeIds.has(e.target.id || e.target)
    );

    const connectedNodeIds = new Set();
    filteredEdges.forEach(e => {
      connectedNodeIds.add(e.source.id || e.source);
      connectedNodeIds.add(e.target.id || e.target);
    });

    finalNodes = finalNodes.filter(n => 
      n.type === 'EVIDENCE' || connectedNodeIds.has(n.id) || (eFilter !== 'ALL' && n.type !== 'EVIDENCE')
    );

    this.data = {
      nodes: finalNodes,
      edges: filteredEdges
    };

    this.render();
  }

  render() {
    this.g.selectAll('*').remove();

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    this.simulation = d3.forceSimulation(this.data.nodes)
      .force('link', d3.forceLink(this.data.edges).id(d => d.id).distance(d => d.type === 'REFERENCES_ENTITY' ? 50 : 100))
      .force('charge', d3.forceManyBody().strength(-240))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.type === 'EVIDENCE' ? 24 : 18));

    // Links
    const link = this.g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(this.data.edges)
      .enter()
      .append('line')
      .attr('stroke', d => {
        if (d.type === 'CAUSES') return '#dc2626';
        if (d.type === 'COMMUNICATES_WITH') return '#059669';
        if (d.type === 'PRECEDES') return '#4f46e5';
        return '#cbd5e1';
      })
      .attr('stroke-width', d => d.type === 'REFERENCES_ENTITY' ? 1.2 : 1.8)
      .attr('stroke-dasharray', d => d.type === 'REFERENCES_ENTITY' ? '3,3' : null)
      .attr('marker-end', d => d.type === 'CAUSES' ? 'url(#arrow-causal)' : (d.type !== 'REFERENCES_ENTITY' ? 'url(#arrow-standard)' : null));

    // Nodes
    const node = this.g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(this.data.nodes)
      .enter()
      .append('g')
      .attr('class', 'node-item')
      .call(d3.drag()
        .on('start', (event, d) => this.dragstarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragended(event, d))
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        this.selectNode(d);
      });

    // Node background circle
    node.append('circle')
      .attr('r', d => d.type === 'EVIDENCE' ? 16 : 13)
      .attr('fill', d => this.getNodeColor(d))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2.5);

    // Entity 2-letter badge text
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-weight', '700')
      .attr('fill', '#ffffff')
      .attr('pointer-events', 'none')
      .text(d => this.getNodeShortLabel(d));

    // Node title text
    node.append('text')
      .attr('dx', d => (d.type === 'EVIDENCE' ? 20 : 16))
      .attr('dy', '.35em')
      .attr('font-size', '11px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', '600')
      .attr('fill', '#0f172a')
      .attr('pointer-events', 'none')
      .text(d => this.truncate(d.label, 24));

    this.simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    const statsEl = document.getElementById('graphStats');
    if (statsEl) {
      statsEl.textContent = `${this.data.nodes.length} nodes • ${this.data.edges.length} edges`;
    }
  }

  getNodeColor(d) {
    if (d.type === 'EVIDENCE') {
      if (d.severity === 'CRITICAL') return '#f43f5e';
      if (d.severity === 'HIGH') return '#ea580c';
      if (d.severity === 'MEDIUM') return '#f59e0b';
      return '#3b82f6';
    }
    if (d.type === 'HOST') return '#38bdf8';
    if (d.type === 'USER') return '#f59e0b';
    if (d.type === 'IP') return '#10b981';
    if (d.type === 'PROCESS') return '#ec4899';
    if (d.type === 'FILE' || d.type === 'HASH') return '#a855f7';
    return '#64748b';
  }

  getNodeShortLabel(d) {
    if (d.type === 'EVIDENCE') return 'EV';
    if (d.type === 'HOST') return 'HS';
    if (d.type === 'USER') return 'US';
    if (d.type === 'IP') return 'IP';
    if (d.type === 'PROCESS') return 'PR';
    if (d.type === 'FILE') return 'FL';
    if (d.type === 'HASH') return 'H#';
    return 'EN';
  }

  truncate(str, max = 22) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  selectNode(d) {
    this.g.selectAll('.node-item circle')
      .attr('stroke', node => node.id === d.id ? '#00684a' : '#ffffff')
      .attr('stroke-width', node => node.id === d.id ? 3.5 : 2.5);

    this.onNodeClick(d);
  }

  highlightKillChain() {
    this.isKillChainHighlighted = !this.isKillChainHighlighted;

    if (!this.isKillChainHighlighted) {
      this.g.selectAll('.links line').attr('opacity', 1).attr('stroke-width', 1.5);
      this.g.selectAll('.node-item').attr('opacity', 1);
      return;
    }

    const killChainTypes = new Set(['CAUSES', 'PRECEDES', 'COMMUNICATES_WITH']);
    this.g.selectAll('.links line')
      .attr('opacity', d => killChainTypes.has(d.type) ? 1 : 0.1)
      .attr('stroke-width', d => killChainTypes.has(d.type) ? 2.5 : 1);

    this.g.selectAll('.node-item')
      .attr('opacity', d => d.type === 'EVIDENCE' ? 1 : 0.3);
  }

  zoomIn() {
    this.svg.transition().duration(250).call(this.zoom.scaleBy, 1.3);
  }

  zoomOut() {
    this.svg.transition().duration(250).call(this.zoom.scaleBy, 0.7);
  }

  fitView() {
    this.svg.transition().duration(400).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(0, 0).scale(0.9)
    );
  }

  dragstarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.2).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  dragended(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

window.EvidenceGraph = EvidenceGraph;
