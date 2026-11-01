with open('server.js', 'r', encoding='utf-8') as f:
    text = f.read()

target = 'res.json({ success: true, message: Successfully cleared  records across all collections. });'
fixed = 'res.json({ success: true, message: `Successfully cleared ${totalDeleted} records across all collections.` });'

if target in text:
    text = text.replace(target, fixed)
    with open('server.js', 'w', encoding='utf-8') as f:
        f.write(text)
    print('FIXED')
else:
    print('NOT FOUND')

