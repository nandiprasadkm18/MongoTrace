with open('services/evidenceService.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """    recordMLDetection(scoreInfo, newDoc).catch(err => {
      console.warn('[Evidence ML] Detection persistence note:', err.message);
    });"""

replacement = """    try {
      await recordMLDetection(scoreInfo, newDoc);
    } catch (detErr) {
      console.warn('[Evidence ML] Detection persistence note:', detErr.message);
    }"""

assert target in content, "target not found"
content = content.replace(target, replacement, 1)

with open('services/evidenceService.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated evidenceService.js with awaited recordMLDetection!")

