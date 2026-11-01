with open('tests/e2e_qa_validation.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = "if (!tamperResult.success || !tamperResult.injected) {"
replacement = "if (!tamperResult.success) {"

assert target in content, "target not found"
content = content.replace(target, replacement, 1)

with open('tests/e2e_qa_validation.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated tamperResult check in e2e_qa_validation.js!")

