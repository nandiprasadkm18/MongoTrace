with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "// Evidence\napp.get('/api/v1/evidence'"
if start_marker not in content:
    start_marker = "// Evidence\r\napp.get('/api/v1/evidence'"

end_marker = "app.post('/api/v1/evidence'"

start_pos = content.find(start_marker)
end_pos = content.find(end_marker, start_pos)

print(f"start_pos: {start_pos}, end_pos: {end_pos}")

clean_route = """// Evidence
app.get('/api/v1/evidence', async (req, res) => {
  try {
    const db = getDB();
    const { investigationId, caseId, severity, artifactType, evidenceType, search, limit = 50, skip = 0 } = req.query;
    const andConditions = [];

    const targetInv = investigationId || caseId;
    if (targetInv && targetInv !== 'ALL') {
      andConditions.push({ $or: [{ investigationId: targetInv }, { caseId: targetInv }] });
    }
    if (severity && severity !== 'ALL') {
      andConditions.push({ severity });
    }
    const type = artifactType || evidenceType;
    if (type && type !== 'ALL') {
      andConditions.push({ $or: [{ artifactType: type }, { evidenceType: type }] });
    }
    if (search && search.trim()) {
      const s = search.trim().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      andConditions.push({
        $or: [
          { title: { $regex: s, $options: 'i' } },
          { description: { $regex: s, $options: 'i' } },
          { evidenceId: { $regex: s, $options: 'i' } },
          { sourceHost: { $regex: s, $options: 'i' } },
          { currentHash: { $regex: s, $options: 'i' } },
          { 'entities.value': { $regex: s, $options: 'i' } }
        ]
      });
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};

    const total = await db.collection('evidence').countDocuments(query);
    const items = await db.collection('evidence').find(query)
      .sort({ timestamp: -1 })
      .skip(parseInt(skip, 10))
      .limit(parseInt(limit, 10))
      .toArray();

    res.json({ success: true, total, count: items.length, evidence: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

"""

new_content = content[:start_pos] + clean_route + content[end_pos:]
with open('server.js', 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Updated server.js cleanly!")

