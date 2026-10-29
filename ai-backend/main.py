from __future__ import annotations

import json
import os
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()


Source = Literal[0, 1, 2]


class ControlPayload(BaseModel):
    ev1: bool
    ev1_source: Source
    ev2: bool
    ev2_source: Source


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    reply: str
    control: ControlPayload | None = None


app = FastAPI(title="Redox EMS AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def source_name(source: Source) -> str:
    return ("Solar", "Battery", "Grid")[source]


def build_prompt(message: str) -> str:
    return f"""
You are an EMS control assistant. Interpret the user's request and return only
valid JSON with exactly these keys:

{{
  "reply": "short natural-language confirmation or clarification",
  "control": {{
    "ev1": true,
    "ev1_source": 0,
    "ev2": false,
    "ev2_source": 0
  }}
}}

Source values are 0=Solar, 1=Battery, 2=Grid.
Set control to null if the request is not an explicit EV control request or is
ambiguous. Never invent a control. If an EV is off, keep its source at 0.
The control must reflect every explicit EV instruction in the request.

User request:
{message}
""".strip()


def extract_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        raise ValueError("Gemini returned a non-text response")

    text = value.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0].strip()
    return json.loads(text)


async def call_gemini(message: str) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured")

    model = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "systemInstruction": {
            "parts": [{"text": "Return JSON only. Follow the requested EMS control schema exactly."}]
        },
        "contents": [{"role": "user", "parts": [{"text": build_prompt(message)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, params={"key": api_key}, json=body)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPStatusError as error:
        detail = error.response.text[:500]
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {detail}") from error
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="Gemini request timed out") from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"Could not reach Gemini: {error}") from error

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return extract_json(text)
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Gemini returned an invalid response") from error


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    result = await call_gemini(request.message)
    reply = result.get("reply")
    raw_control = result.get("control")

    if not isinstance(reply, str) or not reply.strip():
        raise HTTPException(status_code=502, detail="Gemini response did not include a reply")

    control = None
    if raw_control is not None:
        try:
            control = ControlPayload.model_validate(raw_control)
        except Exception as error:
            raise HTTPException(status_code=502, detail="Gemini returned an invalid control") from error

    if control:
        reply = (
            f"{reply} "
            f"EV1: {'on' if control.ev1 else 'off'} via {source_name(control.ev1_source)}; "
            f"EV2: {'on' if control.ev2 else 'off'} via {source_name(control.ev2_source)}."
        )

    return ChatResponse(reply=reply, control=control)
