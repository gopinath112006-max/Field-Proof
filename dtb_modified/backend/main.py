"""
FieldCheck validation API.

Scope
-----
This service validates *image quality and integrity only*. It does not identify
controlled substances and it does not interpret field-test kits. It has no model
and no reference database, and it never returns a classification.

Why this exists
---------------
The v1 endpoint (`/api/analyze`) hardcoded `result: "inconclusive"` and
`validTestKit: False` in every response, and the client rendered one of those
values as though it were an analysis. The two changes that matter here:

  1. The route is `/api/validate` and the response has no `result` or
     `validTestKit` field at all, so there is nothing for a client to mistake
     for a verdict.
  2. `sha256` is computed over the decoded image bytes, which is the same input
     the browser hashes. A digest recorded in a FieldCheck record can therefore
     be checked against the stored frame later.

Run locally:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import os
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

APP_VERSION = "3.0.0"

# A capture is downsampled before upload, so a few megabytes is generous. The
# ceiling exists to stop an unbounded base64 string being decoded into memory.
MAX_IMAGE_BYTES = 12 * 1024 * 1024
MAX_BASE64_CHARS = (MAX_IMAGE_BYTES * 4) // 3 + 1024

# PIL is only used for size and format, never for pixel interpretation. These
# limits bound the work a single request can cause.
MAX_PIXELS = 50_000_000

app = FastAPI(
    title="FieldCheck Validation API",
    version=APP_VERSION,
    description="Image quality and integrity validation. Not a substance identification service.",
)


def _allowed_origins() -> list[str]:
    """Explicit origins only.

    The v1 default was `allow_origins=["*"]`, which let any page on the internet
    call this service from a visitor's browser. Configure a comma-separated list
    in DTB_ALLOWED_ORIGINS; unset means no cross-origin browser access, which is
    the correct default for same-origin hosting.
    """
    raw = os.environ.get("DTB_ALLOWED_ORIGINS", "").strip()
    if not raw:
        return []
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,
)


class ValidateRequest(BaseModel):
    image_base64: str = Field(
        ...,
        max_length=MAX_BASE64_CHARS,
        description="A data URL or bare base64 JPEG/PNG frame.",
    )
    source: str = Field("dtb-web", max_length=64)
    timestamp: str | None = Field(default=None, max_length=64)


def _decode(raw_b64: str) -> bytes:
    """Decode base64, accepting both a data URL and a bare payload."""
    payload = raw_b64.split(",", 1)[-1] if raw_b64.startswith("data:") else raw_b64
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("image_base64 is not valid base64") from exc
    if not data:
        raise ValueError("image_base64 decoded to zero bytes")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError(f"image exceeds the {MAX_IMAGE_BYTES} byte limit")
    return data


def _describe_quality(width: int, height: int) -> str:
    if width < 320 or height < 320:
        return "low resolution"
    if width < 640 or height < 480:
        return "marginal resolution"
    return "adequate resolution"


def _validate(data: bytes) -> dict[str, Any]:
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            image_format = (image.format or "").lower() or "unknown"
    except UnidentifiedImageError as exc:
        raise ValueError("payload is not a recognisable image") from exc
    except (OSError, ValueError) as exc:
        raise ValueError(f"image could not be read: {exc}") from exc

    if width * height > MAX_PIXELS:
        raise ValueError("image dimensions exceed the limit")

    return {
        "quality": _describe_quality(width, height),
        "image_width": width,
        "image_height": height,
        "image_format": image_format,
        "megapixels": round((width * height) / 1_000_000, 2),
        "byte_length": len(data),
        # Same input as the browser's digest, so the two can be compared.
        "sha256": hashlib.sha256(data).hexdigest(),
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "FieldCheck Validation API",
        "version": APP_VERSION,
        "capabilities": "image quality and integrity only",
        "identifies_substances": False,
    }


@app.post("/api/validate")
async def validate(req: ValidateRequest, request: Request) -> JSONResponse:
    """
    Validate one frame's quality and integrity.

    The response deliberately contains no `result`, `validTestKit` or
    classification field. This service has no model and no reference data, so it
    cannot and does not return a verdict about a sample.
    """
    try:
        data = _decode(req.image_base64)
        detail = _validate(data)
    except ValueError as exc:
        # A bad frame is a client-side problem, not a server error.
        return JSONResponse(
            status_code=400,
            content={
                "quality": "unreadable",
                "error": str(exc),
                "identifies_substances": False,
            },
        )

    return JSONResponse(
        status_code=200,
        content={
            **detail,
            "source": req.source,
            "received_at": req.timestamp,
            "identifies_substances": False,
            "note": (
                "Image quality and integrity only. This service does not identify "
                "controlled substances and does not interpret field-test kits. "
                "Presumptive drug classification requires confirmatory laboratory analysis."
            ),
        },
    )


@app.exception_handler(413)
async def too_large(_: Request, __: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=413,
        content={"quality": "unreadable", "error": "request body too large"},
    )
