from fastapi import APIRouter, HTTPException

from app.models.schemas import AnalysisRequest, CallCreate
from app.services.repository import get, insert, find_by
from app.services.risk_engine import calculate_risk_score, risk_severity

router = APIRouter()


@router.post("/")
async def create_call(call: CallCreate):
    return insert("calls", call.model_dump())


@router.get("/{call_id}")
async def get_call(call_id: str):
    call = get("calls", call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return call


@router.post("/{call_id}/analysis")
async def analyze_call(call_id: str, request: AnalysisRequest):
    if get("calls", call_id) is None:
        raise HTTPException(status_code=404, detail="Call not found")
    features = request.model_dump(exclude={"call_id", "timestamp", "features"})
    score = calculate_risk_score(features)
    severity = risk_severity(score)
    analysis = insert("call_analysis", {"call_id": call_id, "deepfake_score": features["deepfake_score"], "speaker_score": features["speaker_similarity"], "prosody_score": features["prosody_score"], "context_score": features["context_score"], "risk_score": score})
    if severity != "LOW":
        insert("alerts", {"call_id": call_id, "severity": severity, "message": "Elevated call risk detected", "recommendation": "Review this call"})
    return {"deepfake_score": features["deepfake_score"], "speaker_score": features["speaker_similarity"], "prosody_score": features["prosody_score"], "context_score": features["context_score"], "risk_score": score, "severity": severity, "analysis": analysis}


@router.get("/{call_id}/analysis")
async def get_call_analysis(call_id: str):
    if get("calls", call_id) is None:
        raise HTTPException(status_code=404, detail="Call not found")
    return find_by("call_analysis", "call_id", call_id)


@router.get("/{call_id}/risk")
async def get_call_risk(call_id: str):
    analyses = find_by("call_analysis", "call_id", call_id)
    if not analyses:
        raise HTTPException(status_code=404, detail="No analysis found for call")
    latest = analyses[-1]
    return {"call_id": call_id, "risk_score": latest["risk_score"], "severity": risk_severity(latest["risk_score"])}


from fastapi import WebSocket, WebSocketDisconnect

class CallSignalingManager:
    def __init__(self):
        self.active_sockets: dict[str, WebSocket] = {}

    async def connect(self, phone: str, websocket: WebSocket):
        await websocket.accept()
        self.active_sockets[phone] = websocket

    def disconnect(self, phone: str):
        if phone in self.active_sockets:
            del self.active_sockets[phone]

    async def send_message(self, message: dict, to_phone: str):
        socket = self.active_sockets.get(to_phone)
        if socket:
            await socket.send_json(message)

signaling_manager = CallSignalingManager()


@router.websocket("/ws/{phone}")
async def websocket_endpoint(websocket: WebSocket, phone: str):
    await signaling_manager.connect(phone, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            target_phone = data.get("to_phone")
            
            if target_phone:
                data["from_phone"] = phone
                if msg_type == "call_initiate":
                    # Check if target is online
                    if target_phone not in signaling_manager.active_sockets:
                        await websocket.send_json({
                            "type": "call_status",
                            "status": "offline",
                            "to_phone": target_phone
                        })
                        continue
                
                await signaling_manager.send_message(data, target_phone)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        signaling_manager.disconnect(phone)
