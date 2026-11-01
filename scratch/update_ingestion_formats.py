with open('services/ingestionService.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  if (format === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fallback to JSONL if JSON parse fails
      return parseJsonLines(trimmed);
    }
  } else if (format === 'jsonl') {
    return parseJsonLines(trimmed);
  } else if (format === 'csv') {
    return parseCSV(trimmed);
  }"""

replacement = """  if (format === 'json' || format === 'application/json' || (trimmed.startsWith('[') || trimmed.startsWith('{'))) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fallback to JSONL if JSON parse fails
      return parseJsonLines(trimmed);
    }
  } else if (format === 'jsonl' || format.includes('jsonl') || format.includes('ndjson')) {
    return parseJsonLines(trimmed);
  } else if (format === 'csv' || format.includes('csv')) {
    return parseCSV(trimmed);
  }"""

assert target in content, "target in ingestionService not found"
content = content.replace(target, replacement, 1)

with open('services/ingestionService.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated parseRawData in ingestionService.js successfully!")

