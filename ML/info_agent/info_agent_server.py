"""FastAPI server for the integrated LG Able Band information agent."""

import os
import sys
from pathlib import Path
from typing import Any, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    __package__ = "ML.info_agent"

from .info_agent import run_info_agent


HOST = "127.0.0.1"
PORT = int(os.environ.get("INFO_AGENT_PORT", "8004"))


class InfoAgentQueryRequest(BaseModel):
    query: str
    userAccessibilityType: Optional[str] = "ALL"
    topK: Optional[int] = 5
    context: Optional[dict[str, Any]] = None


app = FastAPI(
    title="LG Able Band Integrated Info Agent",
    description="Integrated classification, RAG retrieval, and response API.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "service": "lg-able-band-info-agent",
        "status": "running",
        "port": PORT,
        "message": "LG Able Band info_agent server is running.",
    }


@app.post("/api/info-agent/query")
def query_info_agent(request: InfoAgentQueryRequest):
    try:
        return run_info_agent(
            query=request.query,
            user_accessibility_type=request.userAccessibilityType,
            top_k=request.topK or 5,
            safe_mode=True,
            context=request.context,
        )
    except Exception as error:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "agentType": "INFO_AGENT",
                "error": {
                    "type": "InternalServerError",
                    "message": str(error),
                },
            },
        )


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
