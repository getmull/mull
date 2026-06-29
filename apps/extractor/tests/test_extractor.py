import os
import pytest
from unittest.mock import patch
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


def make_empty_pdf() -> bytes:
    doc = fitz.open()
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_extract_text_pdf():
    pdf = make_pdf(["Hello world, this is page one. " * 3, "Page two has some content here. " * 3])
    result = extract_pdf(pdf)
    assert result["page_count"] == 2
    assert result["is_scanned"] is False
    assert len(result["pages"]) == 2


def test_scanned_pdf_detection():
    pdf = make_pdf(["ab", "cd"])
    result = extract_pdf(pdf)
    assert result["avg_chars_per_page"] < SCANNED_THRESHOLD
    assert result["is_scanned"] is True


def test_zero_page_pdf_raises():
    pdf = make_empty_pdf()
    # PyMuPDF may either return len(doc)==0 ("no pages") or raise its own
    # exception on a zero-page stream ("Could not parse PDF") — both are ValueError
    with pytest.raises(ValueError):
        extract_pdf(pdf)


def test_extract_endpoint_rejects_non_pdf():
    response = client.post(
        "/extract",
        files={"file": ("test.txt", b"not a pdf", "text/plain")},
    )
    assert response.status_code == 400


def test_extract_endpoint_rejects_non_pdf_magic_bytes():
    response = client.post(
        "/extract",
        files={"file": ("evil.pdf", b"not a real pdf", "application/pdf")},
    )
    assert response.status_code == 400


def test_extract_endpoint_rejects_uppercase_extension():
    response = client.post(
        "/extract",
        files={"file": ("evil.PDF", b"not a real pdf", "application/pdf")},
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


def test_extract_pdf_raises_on_corrupt_bytes():
    with pytest.raises(ValueError, match="Could not parse PDF"):
        extract_pdf(b"%PDF-corrupted garbage")


# Auth tests — patch _SHARED_SECRET so they run without real env vars

def test_auth_blocks_missing_secret():
    with patch("main._SHARED_SECRET", "test-secret"):
        response = client.post(
            "/extract",
            files={"file": ("test.pdf", b"%PDF-", "application/pdf")},
        )
        assert response.status_code == 401


def test_auth_blocks_wrong_secret():
    with patch("main._SHARED_SECRET", "test-secret"):
        response = client.post(
            "/extract",
            files={"file": ("test.pdf", b"%PDF-", "application/pdf")},
            headers={"X-Extractor-Secret": "wrong-secret"},
        )
        assert response.status_code == 401


def test_auth_allows_correct_secret():
    pdf = make_pdf(["Hello auth test."])
    with patch("main._SHARED_SECRET", "test-secret"):
        response = client.post(
            "/extract",
            files={"file": ("test.pdf", pdf, "application/pdf")},
            headers={"X-Extractor-Secret": "test-secret"},
        )
        assert response.status_code == 200
