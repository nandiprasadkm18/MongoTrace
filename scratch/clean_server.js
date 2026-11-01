const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const marker = "app.get('/api/v1/evidence', async (req, res) => {";
const firstIdx = content.indexOf(marker);
const secondIdx = content.indexOf(marker, firstIdx + 1);

console.log('firstIdx:', firstIdx, 'secondIdx:', secondIdx);
if (secondIdx !== -1) {
  // Find where the search replacement started right before secondIdx
  const lineStart = content.lastIndexOf("const s = search.trim()", secondIdx);
  const endIdx = content.indexOf("});');", secondIdx);
  console.log('lineStart:', lineStart, 'endIdx:', endIdx);
  if (lineStart !== -1 && endIdx !== -1) {
    const badPart = content.substring(lineStart, endIdx + 6);
    const replacement = "const s = search.trim().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');";
    content = content.replace(badPart, replacement);
    fs.writeFileSync('server.js', content, 'utf8');
    console.log('Successfully cleaned server.js!');
  }
}
