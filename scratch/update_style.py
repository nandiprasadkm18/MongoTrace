with open('public/style.css', 'r', encoding='utf-8') as f:
    content = f.read()

target = ".badge-tag.green { background-color: var(--mongo-subtle); color: var(--mongo-green); border: 1px solid rgba(0, 104, 74, 0.2); }"
replacement = target + "\n.badge-tag.normal { background-color: var(--mongo-subtle); color: var(--mongo-green); border: 1px solid rgba(0, 104, 74, 0.2); }"

if target in content and ".badge-tag.normal" not in content:
    content = content.replace(target, replacement, 1)
    with open('public/style.css', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added .badge-tag.normal to style.css!")
else:
    print("Already exists or target not found.")

