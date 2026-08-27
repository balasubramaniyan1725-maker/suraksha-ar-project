"""
qr_util.py
Lightweight, dependency-free (no internet, no `qrcode` pip package needed) QR
generator. Uses reportlab's QR matrix encoder (already vendored) and rasterizes
the module matrix with Pillow. Produces real, scannable QR PNGs.

In the production Android app, QR generation for certificates happens
on-device / on-server using ZXing (Java/Kotlin) or this same service -
this module is what the demo backend uses to issue certificate QR codes.
"""
from reportlab.graphics.barcode.qr import QrCodeWidget
from PIL import Image, ImageDraw, ImageFont
import io


def qr_matrix(data: str):
    w = QrCodeWidget(data)
    w.qr.make()
    return w.qr.modules


def make_qr_png_bytes(data: str, scale: int = 8, border: int = 4) -> bytes:
    matrix = qr_matrix(data)
    n = len(matrix)
    size = (n + border * 2) * scale
    img = Image.new("L", (size, size), 255)
    px = img.load()
    for r in range(n):
        for c in range(n):
            if matrix[r][c]:
                for dy in range(scale):
                    for dx in range(scale):
                        px[(c + border) * scale + dx, (r + border) * scale + dy] = 0
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


def make_certificate_card_png_bytes(worker_name: str, module_name: str,
                                     cert_code: str, verify_url: str,
                                     score: int) -> bytes:
    """Compose a simple printable certificate card with embedded QR."""
    qr_bytes = make_qr_png_bytes(verify_url, scale=6)
    qr_img = Image.open(io.BytesIO(qr_bytes))

    W, H = 1000, 650
    card = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(card)

    d.rectangle([0, 0, W - 1, H - 1], outline=(20, 80, 40), width=6)
    d.rectangle([15, 15, W - 16, H - 16], outline=(20, 80, 40), width=2)

    def font(sz):
        try:
            return ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", sz)
        except Exception:
            return ImageFont.load_default()

    def font_r(sz):
        try:
            return ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", sz)
        except Exception:
            return ImageFont.load_default()

    d.text((W / 2, 60), "SURAKSHA-AR", font=font(40), fill=(20, 80, 40), anchor="mm")
    d.text((W / 2, 105), "Industrial Safety Certification \u2014 Jharkhand",
           font=font_r(18), fill=(80, 80, 80), anchor="mm")
    d.line([(60, 130), (W - 60, 130)], fill=(20, 80, 40), width=2)

    d.text((W / 2, 190), "This certifies that", font=font_r(20), fill=(60, 60, 60), anchor="mm")
    d.text((W / 2, 235), worker_name, font=font(34), fill=(20, 20, 20), anchor="mm")
    d.text((W / 2, 285), "has successfully completed AR safety training and assessment for",
           font=font_r(18), fill=(60, 60, 60), anchor="mm")
    d.text((W / 2, 325), module_name, font=font(26), fill=(150, 40, 20), anchor="mm")
    d.text((W / 2, 370), f"Score: {score}%", font=font_r(20), fill=(60, 60, 60), anchor="mm")

    qr_disp = qr_img.resize((220, 220))
    card.paste(qr_disp, (W - 280, H - 280))
    d.text((W - 280, H - 50), "Scan to verify", font=font_r(14), fill=(80, 80, 80))

    d.text((60, H - 130), f"Certificate ID:\n{cert_code}", font=font_r(16), fill=(40, 40, 40))
    d.text((60, H - 78), "Valid for 12 months from issue date", font=font_r(13), fill=(120, 120, 120))
    disclaimer = ("This certificate confirms completion of SURAKSHA-AR training and assessment.\n"
                  "It does not replace statutory competency certificates, licenses, government\n"
                  "certification, or site-specific authorization.")
    d.text((60, H - 30), disclaimer, font=font_r(10), fill=(140, 140, 140))

    buf = io.BytesIO()
    card.save(buf, format="PNG")
    return buf.getvalue()
