# Scripts

Run these from the repository root. Each one checks that the backend venv and the frontend packages are installed first.

| Script | |
| --- | --- |
| `setup-mac.sh`, `setup-win.ps1` | First-time setup (macOS or Linux, Windows): check Python and Node, create the venv and install the backend and frontend packages. Safe to rerun |
| `dev-mac.sh` | Backend and frontend in one terminal (macOS or Linux) |
| `dev-win.ps1` | Backend and frontend in two PowerShell windows |
| `dev-win.bat` | Backend and frontend in two Windows Terminal tabs |
| `prod-mac.sh`, `prod-win.ps1`, `prod-win.bat` | Same as the dev scripts, but build the frontend first and serve the faster production version at http://localhost:4173. No hot reload, so rerun after code changes |
| `dev-sandbox.sh`, `dev-sandbox.ps1` | The app on a sample library (real song names, generated audio) at http://localhost:5174. Add `--reset` to rebuild it |
| `update-ytdlp-mac.sh`, `update-ytdlp-win.bat` | Update yt-dlp, then restart the backend |

Windows blocks unsigned PowerShell scripts by default, so start them with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-win.ps1
```
