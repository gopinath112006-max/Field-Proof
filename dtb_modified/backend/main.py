from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import base64, io, hashlib
from PIL import Image

app = FastAPI(title="DTB Analysis API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class AnalyzeRequest(BaseModel):
    image_base64: str
    source: str = "dtb-web"
    timestamp: str | None = None

@app.get("/api/health")
def health():
    return {"ok": True, "service": "DTB Analysis API", "mode": "prototype"}

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    """Validate image quality/metadata only.
    This endpoint deliberately does not claim to identify controlled substances.
    """
    raw=req.image_base64.split(",",1)[-1]
    try:
        data=base64.b64decode(raw)
        digest=hashlib.sha256(data).hexdigest()
        image=Image.open(io.BytesIO(data))
        w,h=image.size
        megapixels=round((w*h)/1_000_000,2)
        quality="good" if w>=640 and h>=480 else "low resolution"
        return {
            "result":"inconclusive",
            "validTestKit":False,
            "quality":quality,
            "image_width":w,
            "image_height":h,
            "megapixels":megapixels,
            "sha256":digest,
            "note":"Image quality/metadata API only. Presumptive drug classification requires a validated model and laboratory confirmation."
        }
    except Exception as exc:
        return {"result":"inconclusive","validTestKit":False,"quality":"invalid image","error":str(exc)}
