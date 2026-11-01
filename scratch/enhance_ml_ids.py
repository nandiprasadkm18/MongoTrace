with open('services/mlService.js', 'r', encoding='utf-8') as f:
    content = f.read()

helper_code = """
/**
 * Helper to resolve both investigationId and legacy caseId for an investigation
 */
async function resolveInvestigationIds(targetId) {
  if (!targetId || targetId === 'ALL') return [];
  const db = getDB();
  const inv = await db.collection('investigations').findOne({
    $or: [{ investigationId: targetId }, { caseId: targetId }]
  });
  const ids = new Set([targetId]);
  if (inv) {
    if (inv.investigationId) ids.add(inv.investigationId);
    if (inv.caseId) ids.add(inv.caseId);
  }
  return Array.from(ids);
}
"""

# Insert helper before recordMLDetection
target_anchor = "async function recordMLDetection"
assert target_anchor in content
content = content.replace(target_anchor, helper_code + "\n" + target_anchor, 1)

# Update getMLDetections
old_query_mld = """  const targetInv = investigationId || caseId;
  if (targetInv && targetInv !== 'ALL') {
    query.$or = [{ investigationId: targetInv }, { caseId: targetInv }];
  }"""

new_query_mld = """  const targetInv = investigationId || caseId;
  if (targetInv && targetInv !== 'ALL') {
    const ids = await resolveInvestigationIds(targetInv);
    query.$or = [
      { investigationId: { $in: ids } },
      { caseId: { $in: ids } }
    ];
  }"""

assert old_query_mld in content
content = content.replace(old_query_mld, new_query_mld, 1)

# Update getMLStats
old_stats_match = """  if (investigationId && investigationId !== 'ALL') {
    matchStage.$or = [{ investigationId }, { caseId: investigationId }];
  }"""

new_stats_match = """  if (investigationId && investigationId !== 'ALL') {
    const ids = await resolveInvestigationIds(investigationId);
    matchStage.$or = [
      { investigationId: { $in: ids } },
      { caseId: { $in: ids } }
    ];
  }"""

assert old_stats_match in content
content = content.replace(old_stats_match, new_stats_match, 1)

# Update evaluateInvestigationWithML
old_eval_query = """async function evaluateInvestigationWithML(investigationId) {
  const db = getDB();
  const evidenceList = await db.collection('evidence')
    .find({ $or: [{ investigationId }, { caseId: investigationId }] })
    .toArray();"""

new_eval_query = """async function evaluateInvestigationWithML(investigationId) {
  const db = getDB();
  const ids = await resolveInvestigationIds(investigationId);
  const evidenceList = await db.collection('evidence')
    .find({
      $or: [
        { investigationId: { $in: ids } },
        { caseId: { $in: ids } }
      ]
    })
    .toArray();"""

assert old_eval_query in content
content = content.replace(old_eval_query, new_eval_query, 1)

with open('services/mlService.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated services/mlService.js with dual ID harmonization!")

