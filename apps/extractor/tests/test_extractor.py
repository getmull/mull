import pytest
from fastapi.testclient import TestClient
from main import app, extract_pdf, SCANNED_THRESHOLD
import fitz
import io


client = TestClient(app)


def make_pdf(text_per_page: list[str]) -> bytes:
    doc = fitz.open()
    for text in text_per_page:
        page = doc.new_page()
        page.insert_text((50, 50), text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_extract_text_pdf():
    pdf = make_pdf(["Hello world, this is page one.", "Page two has some content here."])
    result = extract_pdf(pdf)
    assert result["page_count"] == 2
    assert result["is_scanned"] is False
    assert len(result["pages"]) == 2


def test_scanned_pdf_detection():
    # Page with very little text simulates a scanned PDF
    pdf = make_pdf(["ab", "cd"])
    result = extract_pdf(pdf)
    assert result["avg_chars_per_page"] < SCANNED_THRESHOLD
    assert result["is_scanned"] is True


def test_extract_endpoint_rejects_non_pdf():
    response = client.post(
        "/extract",
        files={"file": ("test.txt", b"not a pdf", "text/plain")},
    )
    assert response.status_code == 400


def test_extract_endpoint_accepts_pdf():
    pdf = make_pdf(["This is a test document with enough text to not be considered scanned."])
    response = client.post(
        "/extract",
        files={"file": ("test.pdf", pdf, "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["page_count"] == 1
    assert "pages" in data


def test_extract_endpoint_rejects_non_pdf_magic_bytes():
    # File has .pdf extension but is not a real PDF
    response = client.post(
        "/extract",
        files={"file": ("evil.pdf", b"not a real pdf", "application/pdf")},
    )
    assert response.status_code == 400


def test_extract_pdf_raises_on_corrupt_bytes():
    with pytest.raises(ValueError, match="Could not parse PDF"):
        extract_pdf(b"%PDF-corrupted garbage")
