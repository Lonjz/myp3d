# mp3download

Full-stack app for downloading YouTube audio as MP3s and editing local metadata.

## Quick start

Backend:

```bash
cd myp3d-backend
python -m venv venv
```

Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd myp3d-frontend
npm install
npm run dev
```

## Config

- Backend: `USE_SYSTEM_FFMPEG=true|false`
- Frontend: `VITE_API_BASE_URL=http://localhost:8000`

## Structure

- `myp3d-backend/` FastAPI API
- `myp3d-frontend/` React + Vite UI
- `run/` helper scripts
