"""Tests for the FieldCheck validation API.

Run with:
    python -m pytest backend -q

The point of these tests is scope. The v1 service returned a hardcoded
`result: "inconclusive"` and `validTestKit: False` that the client rendered as
an "AI POWERED" result, so a regression that reintroduces any classification
field has to fail here.
"""

from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from main import MAX_IMAGE_BYTES, app  # noqa: E402


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def make_image_bytes(size=(640, 480), fmt="JPEG") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(buffer, format=fmt)
    return buffer.getvalue()


def data_url(payload: bytes) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(payload).decode("ascii")


# --- scope: nothing here may look like a verdict ---------------------------


def test_validate_response_has_no_classification_fields(client):
    response = client.post("/api/validate", json={"image_base64": data_url(make_image_bytes())})
    assert response.status_code == 200
    body = response.json()

    for banned in ("result", "validTestKit", "verdict", "substance", "classification", "positives"):
        assert banned not in body, f"{banned!r} reintroduced a classification field"


def test_validate_declares_it_does_not_identify_substances(client):
    body = client.post("/api/validate", json={"image_base64": data_url(make_image_bytes())}).json()
    assert body["identifies_substances"] is False
    assert "laboratory" in body["note"].lower()


def test_health_declares_no_identification(client):
    body = client.get("/api/health").json()
    assert body["identifies_substances"] is False
    assert "quality" in body["capabilities"].lower()


def test_legacy_analyze_route_is_gone(client):
    # The frontend used to call this and render the response as a result.
    assert client.post("/api/analyze", json={"image_base64": data_url(make_image_bytes())}).status_code == 404


# --- integrity -------------------------------------------------------------


def test_sha256_matches_the_bytes_actually_uploaded(client):
    import hashlib

    payload = make_image_bytes()
    body = client.post("/api/validate", json={"image_base64": data_url(payload)}).json()
    assert body["sha256"] == hashlib.sha256(payload).hexdigest()


def test_accepts_a_bare_base64_payload(client):
    payload = make_image_bytes()
    bare = base64.b64encode(payload).decode("ascii")
    body = client.post("/api/validate", json={"image_base64": bare}).json()
    assert body["image_width"] == 640


# --- quality judgement -----------------------------------------------------


def test_reports_dimensions_and_quality(client):
    body = client.post("/api/validate", json={"image_base64": data_url(make_image_bytes((1024, 768)))}).json()
    assert (body["image_width"], body["image_height"]) == (1024, 768)
    assert body["quality"] == "adequate resolution"


def test_small_frame_is_reported_as_low_resolution(client):
    body = client.post("/api/validate", json={"image_base64": data_url(make_image_bytes((160, 120)))}).json()
    assert body["quality"] == "low resolution"


# --- rejection paths -------------------------------------------------------


def test_non_image_payload_is_rejected(client):
    response = client.post("/api/validate", json={"image_base64": base64.b64encode(b"not an image").decode()})
    assert response.status_code == 400
    assert response.json()["quality"] == "unreadable"


def test_invalid_base64_is_rejected(client):
    response = client.post("/api/validate", json={"image_base64": "!!!not base64!!!"})
    assert response.status_code == 400


def test_empty_payload_is_rejected(client):
    # An empty string clears the pydantic bound and is caught by the decoder,
    # which reports a bad frame (400) rather than a malformed request (422).
    response = client.post("/api/validate", json={"image_base64": ""})
    assert response.status_code == 400
    assert response.json()["error"]


def test_oversized_declared_payload_is_rejected(client):
    # An absurd base64 string is refused before any decoding is attempted.
    huge = "A" * (12 * 1024 * 1024 * 4 // 3 + 4096)
    response = client.post("/api/validate", json={"image_base64": huge})
    assert response.status_code in (400, 413, 422)


def test_max_image_bytes_constant_is_sane():
    assert 1024 < MAX_IMAGE_BYTES <= 64 * 1024 * 1024
