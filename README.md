# Sale Analysis — Development Setup

This project has a Go backend and a Vue frontend. The frontend uses Bun as package manager.

---

## Requirements

-   Go (1.20+ recommended)
-   Python 3.9+
-   Bun (for frontend package management)
-   sqlite3 (optional, for CLI inspection)

---

## Files of interest

-   Backend source: `backend/src/main.go`
-   Python scripts: `backend/script/sessionizer.py`, `backend/script/session_analyzer.py`
-   Python requirements: `backend/script/requirements.txt`
-   Frontend: `frontend/` (Vite + Vue)
-   DB schema: `backend/sql/schema.sql`
-   Example inputs: `sample_input/`

---

## Environment and API key

The LLM analyzer requires a Google API key. Create a `.env` file inside `backend/script/` with the following content:

```
GOOGLE_API_KEY=your_real_google_api_key_here
```

Alternatively set the environment variable before running the backend (see platform-specific notes below).

Notes:

-   The backend only auto-loads schema from `backend/sql/schema.sql` (or via `SCHEMA_PATH`). A legacy `db.sql` is not used.
-   If Python is not named `python` on your system (e.g. `python3`), you can set `PYTHON_CMD` env var to the executable path.
-   You can override DB and schema paths with `DB_PATH` and `SCHEMA_PATH` environment variables.

---

## Python (virtual env) setup

From the project root:

Windows cmd.exe

```
cd \path\to\sale-analysis\backend\script
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

PowerShell

```
cd \path\to\sale-analysis\backend\script
python -m venv .venv
. .venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

macOS / Linux (bash)

```
cd /path/to/sale-analysis/backend/script
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Notes:

-   `requirements.txt` is at `backend/script/requirements.txt`.
-   The backend prefers a virtualenv at `backend/script/.venv`. It will also detect a repo-root `.venv`.

---

## Go (backend) setup & run

From the project root (recommended):

Windows cmd.exe

```
cd \path\to\sale-analysis\backend
set GOOGLE_API_KEY=your_real_google_api_key_here
go run -v src\main.go
```

PowerShell

```
cd \path\to\sale-analysis\backend
$env:GOOGLE_API_KEY = "your_real_google_api_key_here"
go run -v src\main.go
```

macOS / Linux (bash)

```
cd /path/to/sale-analysis/backend
export GOOGLE_API_KEY=your_real_google_api_key_here
go run -v src/main.go
```

Notes:

-   The server exposes:
    -   POST `/api/process` — upload a raw chat JSON, runs sessionizer/analyzer, imports into SQLite, returns analyzed JSON.
    -   GET `/api/dashboard` — returns star-schema aggregates for the frontend dashboard.
-   The server prints its configuration on startup.

Optional: build a standalone binary:

```
cd backend
go build -o sale-backend ./src
# then run .\sale-backend (Windows) or ./sale-backend (macOS/Linux)
```

---

## Frontend (Bun) setup & run

The project uses Bun as the package manager. From the `frontend` folder:

Install Bun (one of the following):

macOS / Linux (recommended):

```
curl -fsSL https://bun.sh/install | bash
# follow the printed instructions to add bun to PATH (restart shell)
```

Windows (Scoop) — if you use Scoop:

```
scoop install bun
```

or use the official installer method described at https://bun.sh/

Install dependencies and start dev server:

```
cd frontend
bun install
bun run dev
```

Note: If the frontend dev server (Vite) runs on a different port than the backend, a dev proxy in `frontend/vite.config.ts` forwards `/api` to `http://localhost:8080`.

The Chrome extension popup shows a compact dashboard and a file upload to process new sessions.

---

## Dashboard API (star-schema aggregates)

Fetch the dashboard metrics:

```
curl http://localhost:8080/api/dashboard
```

Example response shape:

```json
{
    "total_sessions": 42,
    "sessions_by_customer_type": { "new": 10, "returning": 20, "vip": 12 },
    "sessions_by_outcome": { "purchase": 18, "inquiry": 15, "abandon": 9 },
    "sessions_by_quality": { "good": 25, "average": 12, "poor": 5 },
    "sessions_by_risk": { "none": 30, "complaint": 7, "refund": 5 }
}
```

---

## Troubleshooting

-   404 from frontend when calling `/api/*`: restart Vite after edits, or ensure `frontend/vite.config.ts` proxy is configured. Alternatively use absolute URLs (e.g., `http://localhost:8080/api/process`).
-   If Go server exits on start, check logs. Common cause: missing `schema.sql`. Place it at `backend/sql/schema.sql` or set `SCHEMA_PATH`.
-   If Python scripts fail, run them manually to see stderr:

```
# from backend folder
python ./script/sessionizer.py sample_input/sample_1.json
python ./script/session_analyzer.py backend/json/sessionized/your_file_sessionized.json
```

-   Ensure `GOOGLE_API_KEY` is set (either in `backend/script/.env` or as an environment variable).
