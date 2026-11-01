import fitz
doc = fitz.open(r'c:\Users\nandi\OneDrive\Desktop\nosql\MongoTrace_Project_Report.pdf')
for i, p in enumerate(doc):
    text = p.get_text()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    first_line = lines[0] if lines else ''
    last_line = lines[-1] if lines else ''
    print(f'Page {i+1}: length={len(text)} chars | First: "{first_line[:40]}" | Last: "{last_line[:40]}"')

