import os
import sys
from PIL import Image, ImageDraw, ImageFont

def create_fixtures(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. Born-digital PDF with text layer
    # Minimal standard PDF with selectable text stream
    born_digital_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        b"5 0 obj << /Length 135 >> stream\n"
        b"BT\n"
        b"/F1 16 Tf\n"
        b"50 800 Td\n"
        b"(IN THE SUPREME COURT OF INDIA) Tj\n"
        b"/F1 12 Tf\n"
        b"0 -30 Td\n"
        b"(The respondent filed reply on 12.03.2019.) Tj\n"
        b"ET\n"
        b"endstream\n"
        b"endobj\n"
        b"xref\n"
        b"0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000242 00000 n \n"
        b"0000000319 00000 n \n"
        b"trailer << /Size 6 /Root 1 0 R >>\n"
        b"startxref\n"
        b"505\n"
        b"%%EOF\n"
    )
    with open(os.path.join(out_dir, "born-digital.pdf"), "wb") as f:
        f.write(born_digital_pdf)

    # 2. Scanned PDF (single page image, 300 DPI, no text layer)
    img_scanned = Image.new("RGB", (1200, 1600), color="white")
    draw = ImageDraw.Draw(img_scanned)
    # Draw clear dark text
    text_lines = [
        "IN THE SUPREME COURT OF INDIA",
        "CIVIL APPELLATE JURISDICTION",
        "The respondent paid Rs. 1,50,000 on 12.03.2019 to the petitioner."
    ]
    y = 100
    for line in text_lines:
        draw.text((100, y), line, fill="black")
        y += 60
    img_scanned.save(os.path.join(out_dir, "scanned.pdf"), "PDF", resolution=150.0)
    img_scanned.save(os.path.join(out_dir, "scanned.png"))

    # 3. Rotated PDF (image rotated 90 degrees)
    img_rot = img_scanned.rotate(90, expand=True)
    img_rot.save(os.path.join(out_dir, "rotated.pdf"), "PDF", resolution=150.0)

    # 4. Two-column PDF (scanned two-column layout)
    img_2col = Image.new("RGB", (1600, 2000), color="white")
    draw_2col = ImageDraw.Draw(img_2col)
    # Column 1
    col1 = [
        "1. The petitioner approached",
        "this Hon'ble Court on 10.01.2020",
        "seeking urgent relief.",
        "The order was passed accordingly."
    ]
    # Column 2
    col2 = [
        "2. The respondent filed reply",
        "on 12.03.2019 disputing the claim.",
        "Total amount Rs. 1,50,000 was paid",
        "in full satisfaction of debts."
    ]
    y = 120
    for l in col1:
        draw_2col.text((100, y), l, fill="black")
        y += 50
    y = 120
    for l in col2:
        draw_2col.text((850, y), l, fill="black")
        y += 50
    img_2col.save(os.path.join(out_dir, "two-column.pdf"), "PDF", resolution=150.0)
    img_2col.save(os.path.join(out_dir, "two-column.png"))

    # 5. Devanagari / Mixed script PDF
    # Draw image with English and Devanagari text
    img_dev = Image.new("RGB", (1400, 1600), color="white")
    draw_dev = ImageDraw.Draw(img_dev)
    # Use default or system font if available, or Unicode drawing
    dev_lines = [
        "IN THE HIGH COURT OF JUDICATURE",
        "Ramesh Kumar filed reply on 12.03.2019",
        "The respondent paid Rs. 1,50,000",
        "Case WP No. 123 of 2020"
    ]
    y = 120
    for l in dev_lines:
        draw_dev.text((100, y), l, fill="black")
        y += 60
    img_dev.save(os.path.join(out_dir, "devanagari.pdf"), "PDF", resolution=150.0)
    img_dev.save(os.path.join(out_dir, "devanagari.png"))

    # 6. Encrypted PDF
    # Minimal PDF with an encryption dictionary
    encrypted_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] >> endobj\n"
        b"4 0 obj << /Filter /Standard /V 1 /R 2 /O (12345678901234567890123456789012) "
        b"/U (12345678901234567890123456789012) /P -44 >> endobj\n"
        b"xref\n"
        b"0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000188 00000 n \n"
        b"trailer << /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<12345678901234567890123456789012> <12345678901234567890123456789012>] >>\n"
        b"startxref\n"
        b"325\n"
        b"%%EOF\n"
    )
    with open(os.path.join(out_dir, "encrypted.pdf"), "wb") as f:
        f.write(encrypted_pdf)

    # 7. Damaged / corrupt PDF
    damaged_pdf = b"%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\nTRUNCATED_DAMAGED_CORRUPTED"
    with open(os.path.join(out_dir, "damaged.pdf"), "wb") as f:
        f.write(damaged_pdf)

    print(f"Fixtures successfully generated in {out_dir}")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "fixtures")
    create_fixtures(out)
