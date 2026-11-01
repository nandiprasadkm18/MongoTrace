from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
import fitz

doc = SimpleDocTemplate("scratch/test_bullet.pdf")
styles = getSampleStyleSheet()
p1 = Paragraph("&bull; Test with HTML bull", styles['Normal'])
p2 = Paragraph("&#8226; Test with decimal entity", styles['Normal'])
p3 = Paragraph("- Test with hyphen", styles['Normal'])
doc.build([p1, p2, p3])

fdoc = fitz.open("scratch/test_bullet.pdf")
print("Rendered text:\n", fdoc[0].get_text())

