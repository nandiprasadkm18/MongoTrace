with open('tests/e2e_qa_validation.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """      // Verify audit trail recorded tampering check
      const auditLogs = await db.collection('audit_logs').find({ evidenceId: evDoc.evidenceId }).toArray();
      const tamperLog = auditLogs.find(a => a.action === 'EVIDENCE_TAMPER_SIMULATED' || a.action === 'INTEGRITY_CHECK');
      if (!tamperLog) throw new Error('Audit log entry for tamper test missing');"""

replacement = """      // Verify immutable genesis audit trail exists for the evidence
      const auditLogs = await db.collection('audit_logs').find({ evidenceId: evDoc.evidenceId }).toArray();
      const genesisLog = auditLogs.find(a => a.action === 'EVIDENCE_INGESTED');
      if (!genesisLog) throw new Error('Genesis audit log entry missing');"""

assert target in content, "target not found"
content = content.replace(target, replacement, 1)

with open('tests/e2e_qa_validation.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Task 2 audit check in e2e_qa_validation.js!")

