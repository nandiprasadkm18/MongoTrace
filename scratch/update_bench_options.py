with open('public/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

target = """                <select id="benchItemCount" class="select-field" style="width: 110px;">
                  <option value="500">500 items</option>
                  <option value="1500" selected>1,500 items</option>
                  <option value="5000">5,000 items</option>
                  <option value="15000">15,000 items</option>
                </select>"""

replacement = """                <select id="benchItemCount" class="select-field" style="width: 140px;">
                  <option value="1000" selected>1,000 records</option>
                  <option value="10000">10,000 records</option>
                  <option value="50000">50,000 records</option>
                  <option value="100000">100,000 records</option>
                </select>"""

assert target in content, "target not found in index.html"
content = content.replace(target, replacement, 1)

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated benchItemCount in index.html to 1K, 10K, 50K, 100K!")

