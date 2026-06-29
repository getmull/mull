import hmac
import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import fitz  # pymupdf

app = FastAPI(title="Mull Extractor", version="0.1.0")

SCANNED_THRESHOLD = 50  # chars per page average — below this, PDF is likely scanned
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
PDF_MAGIC = b"%PDF-"

# Empty string treated as unset so operators who set EXTRACTOR_SECRET= in .env
# don't silently disable auth.
_SHARED_SECRET = os.environ.get("EXTRACTOR_SECRET") or None


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_UPLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "File exceeds 100 MB limit"},
            )
        return await call_next(request)


app.add_middleware(MaxBodySizeMiddleware)


def _check_auth(x_extractor_secret: str | None) -> None:
    if _SHARED_SECRET:
        if x_extractor_secret is None or not hmac.compare_digest(
            x_extractor_secret, _SHARED_SECRET
        ):
            raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    x_extractor_secret: str | None = Header(default=None),
):
    _check_auth(x_extractor_secret)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 100 MB limit")

    if not contents.startswith(PDF_MAGIC):
        raise HTTPException(status_code=400, detail="File is not a valid PDF")

    try:
        return extract_pdf(contents)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


def extract_pdf(contents: bytes) -> dict:
    try:
        doc = fitz.open(stream=contents, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Could not parse PDF: {e}")

    page_count = len(doc)
    if page_count == 0:
        raise ValueError("PDF has no pages")

    pages = []
    total_chars = 0

    for i, page in enumerate(doc):
        text = page.get_text()
        pages.append({"page_number": i + 1, "text": text})
        total_chars += len(text)

    avg_chars = total_chars / page_count
    is_scanned = avg_chars < SCANNED_THRESHOLD

    return {
        "page_count": page_count,
        "is_scanned": is_scanned,
        "avg_chars_per_page": round(avg_chars, 1),
        "pages": pages,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
