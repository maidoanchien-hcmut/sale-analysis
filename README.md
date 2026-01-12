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
-   DB schema: `backend/sql/schema.sql` or `backend/sql/db.sql` (the server will accept either)
-   Example inputs: `sample_input/`

---

## Environment and API key

The LLM analyzer requires a Google API key. Create a `.env` file inside `backend/script/` with the following content:

```
GOOGLE_API_KEY=your_real_google_api_key_here
```

Alternatively set the environment variable before running the backend (see platform-specific notes below).

If Python is not named `python` on your system (e.g. `python3`), you can set `PYTHON_CMD` env var to the executable path.

You can also override DB and schema paths with `DB_PATH` and `SCHEMA_PATH` environment variables.

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

-   `requirements.txt` is located at `backend/script/requirements.txt` and currently contains `google-genai`, `pydantic`, and `python-dotenv`.

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

-   The server will try to find a python executable (`python3` or `python`) automatically; set `PYTHON_CMD` if needed.
-   If your schema file is named `db.sql`, the backend looks for `./sql/schema.sql` first then `./sql/db.sql`.
-   The backend prints configuration on startup.

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

Note: If you prefer npm/yarn, `bun` can also run package.json scripts via `bun run`.

If the frontend dev server (Vite) runs on a different port than the backend, the project includes a dev proxy in `frontend/vite.config.ts` that forwards `/api` to `http://localhost:8080`. If you change the backend port, also update the Vite config or use absolute URL in the frontend code.

---

## Test upload (curl)

From project root, upload a sample file to the backend:

Windows cmd.exe

```
cd \path\to\sale-analysis
curl -v -F "file=@sample_input/sample_1.json" http://localhost:8080/api/process
```

macOS / Linux

```
cd /path/to/sale-analysis
curl -v -F 'file=@sample_input/sample_1.json' http://localhost:8080/api/process
```

The backend will run the sessionizer, analyzer (LLM), import the analyzed sessions into SQLite, and return the analyzed JSON.

---

## Troubleshooting

-   404 from frontend when calling `/api/*`: restart Vite after edits, or ensure `frontend/vite.config.ts` proxy is configured and Vite restarted. Alternatively change the fetch URL to `http://localhost:8080/api/process`.
-   If Go server exits on start, run `go run -v src/main.go 2>&1` to view errors. Common cause: missing schema file or missing SQLite driver (Go will print a build error).
-   If Python scripts fail, run them manually to see stderr:

```
# from backend folder
python ./script/sessionizer.py sample_input/sample_1.json
python ./script/session_analyzer.py backend/json/sessionized/your_file_sessionized.json
```

-   Ensure `GOOGLE_API_KEY` is set (either in `backend/script/.env` or as an environment variable). The analyzer logs a warning to stderr if the key is missing.
