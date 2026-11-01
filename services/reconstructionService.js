const { getDB, logMongoOperation } = require('./db');

/**
 * Reconstruct incident timeline and causal graph using MongoDB Aggregation Pipelines
 */
async function reconstructIncident(caseId, options = {}) {
  const db = getDB();

  const targetId = options.investigationId || options.caseId || caseId;
  const matchFilter = {
    $or: [{ caseId: targetId }, { investigationId: targetId }]
  };
  if (options.severity) matchFilter.severity = options.severity;
  if (options.artifactType) matchFilter.artifactType = options.artifactType;
  if (options.startDate || options.endDate) {
    matchFilter.timestamp = {};
    if (options.startDate) matchFilter.timestamp.$gte = new Date(options.startDate);
    if (options.endDate) matchFilter.timestamp.$lte = new Date(options.endDate);
  }

  // 1. Faceted Aggregation Pipeline for comprehensive incident analytics & timeline
  const aggregationPipeline = [
    { $match: matchFilter },
    { $sort: { timestamp: 1 } },
    {
      $facet: {
        timelineEvents: [
          {
            $project: {
              evidenceId: 1,
              caseId: 1,
              timestamp: 1,
              artifactType: 1,
              severity: 1,
              sourceHost: 1,
              title: 1,
              description: 1,
              mitreTactic: 1,
              mitreTechnique: 1,
              entities: 1,
              version: 1,
              currentHash: 1,
              gridfsFileId: 1,
              metadata: 1,
              tags: 1
            }
          }
        ],
        severityDistribution: [
          { $group: { _id: '$severity', count: { $sum: 1 } } }
        ],
        artifactDistribution: [
          { $group: { _id: '$artifactType', count: { $sum: 1 } } }
        ],
        tacticBreakdown: [
          { $group: { _id: '$mitreTactic', count: { $sum: 1 } } }
        ],
        hostActivity: [
          { $group: { _id: '$sourceHost', eventCount: { $sum: 1 }, latestEvent: { $max: '$timestamp' } } },
          { $sort: { eventCount: -1 } }
        ],
        timeBounds: [
          {
            $group: {
              _id: null,
              firstEvent: { $min: '$timestamp' },
              lastEvent: { $max: '$timestamp' },
              totalEvidence: { $sum: 1 }
            }
          }
        ]
      }
    }
  ];

  const t0 = performance.now();
  const [facetResults] = await db.collection('evidence').aggregate(aggregationPipeline).toArray();
  const t1 = performance.now();

  const events = (facetResults && facetResults.timelineEvents) || [];
  logMongoOperation('aggregate ($facet)', 'evidence', aggregationPipeline, t1 - t0, events.length);

  const tRel0 = performance.now();
  const relations = await db.collection('evidence_relations').find({
    $or: [{ caseId: targetId }, { investigationId: targetId }]
  }).toArray();
  const tRel1 = performance.now();
  logMongoOperation('find', 'evidence_relations', { caseId }, tRel1 - tRel0, relations.length);

  // Construct Nodes and Edges for the Interactive Evidence Graph
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();

  function addNode(id, label, type, properties = {}) {
    if (!nodeMap.has(id)) {
      const node = { id, label, type, ...properties };
      nodeMap.set(id, node);
      nodes.push(node);
    }
  }

  // Add Evidence Event Nodes
  for (const ev of events) {
    addNode(ev.evidenceId, ev.title, 'EVIDENCE', {
      severity: ev.severity,
      artifactType: ev.artifactType,
      timestamp: ev.timestamp,
      mitreTactic: ev.mitreTactic,
      sourceHost: ev.sourceHost,
      version: ev.version,
      rawDoc: ev
    });

    // Add Entity Nodes & Connect them to this Evidence Node
    if (Array.isArray(ev.entities)) {
      for (const ent of ev.entities) {
        const entityNodeId = `ENT-${ent.type}-${ent.value}`;
        addNode(entityNodeId, ent.value, ent.type, {
          entityType: ent.type,
          entityValue: ent.value
        });

        edges.push({
          source: ev.evidenceId,
          target: entityNodeId,
          type: 'REFERENCES_ENTITY',
          label: 'observes'
        });
      }
    }
  }

  // Add Explicit Causal Relations as Edges
  for (const rel of relations) {
    if (nodeMap.has(rel.sourceEvidenceId) && nodeMap.has(rel.targetEvidenceId)) {
      edges.push({
        id: rel.relationId,
        source: rel.sourceEvidenceId,
        target: rel.targetEvidenceId,
        type: rel.relationType,
        label: rel.relationType,
        confidence: rel.confidence,
        description: rel.description
      });
    }
  }

  const timeBounds = (facetResults && facetResults.timeBounds && facetResults.timeBounds[0]) || {
    firstEvent: null,
    lastEvent: null,
    totalEvidence: events.length
  };

  return {
    investigationId: targetId,
    caseId: targetId,
    timeline: events,
    graph: { nodes, edges },
    metrics: {
      totalEvidence: events.length,
      firstEvent: timeBounds.firstEvent,
      lastEvent: timeBounds.lastEvent,
      durationMinutes: timeBounds.firstEvent && timeBounds.lastEvent 
        ? Math.round((new Date(timeBounds.lastEvent) - new Date(timeBounds.firstEvent)) / 60000)
        : 0,
      severityCounts: facetResults?.severityDistribution || [],
      artifactCounts: facetResults?.artifactDistribution || [],
      tacticCounts: facetResults?.tacticBreakdown || [],
      hostActivity: facetResults?.hostActivity || []
    },
    aggregationPipelineExecuted: aggregationPipeline
  };
}

/**
 * Traverse recursive causal chain using MongoDB $graphLookup
 */
async function traceCausalityChain(caseId, startEvidenceId, maxDepth = 10) {
  const db = getDB();
  const idFilter = { $or: [{ caseId }, { investigationId: caseId }] };

  const pipeline = [
    { $match: { ...idFilter, sourceEvidenceId: startEvidenceId } },
    {
      $graphLookup: {
        from: 'evidence_relations',
        startWith: '$targetEvidenceId',
        connectFromField: 'targetEvidenceId',
        connectToField: 'sourceEvidenceId',
        as: 'downstreamCausalChain',
        maxDepth: maxDepth - 1,
        depthField: 'hopDistance',
        restrictSearchWithMatch: idFilter
      }
    }
  ];

  const t0 = performance.now();
  const results = await db.collection('evidence_relations').aggregate(pipeline).toArray();
  const t1 = performance.now();
  logMongoOperation('aggregate ($graphLookup)', 'evidence_relations', pipeline, t1 - t0, results.length);

  return results;
}

module.exports = {
  reconstructIncident,
  traceCausalityChain
};
