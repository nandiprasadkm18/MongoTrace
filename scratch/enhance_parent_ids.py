with open('services/evidenceService.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  const investigationId = evidenceData.investigationId || evidenceData.caseId || 'INV-2026-DEFAULT';
  const caseId = evidenceData.caseId || investigationId;"""

replacement = """  let investigationId = evidenceData.investigationId || evidenceData.caseId || 'INV-2026-DEFAULT';
  let caseId = evidenceData.caseId || evidenceData.investigationId || investigationId;
  if ((!evidenceData.caseId || !evidenceData.investigationId) && investigationId !== 'INV-2026-DEFAULT') {
    try {
      const parentInv = await db.collection('investigations').findOne({
        $or: [{ investigationId }, { caseId }]
      });
      if (parentInv) {
        if (parentInv.investigationId) investigationId = parentInv.investigationId;
        if (parentInv.caseId) caseId = parentInv.caseId;
      }
    } catch (_) {}
  }"""

assert target in content, "target not found"
content = content.replace(target, replacement, 1)

with open('services/evidenceService.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Enhanced createEvidence with bidirectional parent ID harmonization!")

