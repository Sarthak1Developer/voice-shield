from fastapi import APIRouter

from app.models.schemas import AnalysisRequest
from app.services.risk_engine import calculate_risk_score, risk_severity

router = APIRouter()


@router.post("/")
async def analyze_audio(request: AnalysisRequest):
    features = request.model_dump(exclude={"call_id", "timestamp", "features"})
    score = calculate_risk_score(features)
    return {"deepfake_score": features["deepfake_score"], "speaker_score": features["speaker_similarity"], "prosody_score": features["prosody_score"], "context_score": features["context_score"], "risk_score": score, "severity": risk_severity(score)}


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: str):
    return {"analysis_id": analysis_id, "message": "Analysis result placeholder"}
