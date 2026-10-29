# Redox EMS AI backend

This FastAPI service sends chat requests to Gemini and returns a validated EMS
control payload. It loads `GEMINI_API_KEY` and `GEMINI_MODEL` from the process
environment or `ai-backend/.env`; it does not expose the Gemini key to the frontend.

```powershell
cd ai-backend
python -m pip install -r requirements.txt
$env:GEMINI_API_KEY = "your-key"
uvicorn main:app --host 0.0.0.0 --port 9000
```

The frontend calls `POST http://localhost:9000/chat`. The returned control is
then submitted through the Spring Boot backend's existing `POST /control`
function.
