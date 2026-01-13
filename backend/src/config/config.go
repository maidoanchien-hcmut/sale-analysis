package config

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

var (
	DbPath         string
	SchemaPath     string
	DirUpload      string
	PythonCmd      string
	ScriptAnalyzer string
)

func Init() {
	if v := os.Getenv("PYTHON_CMD"); v != "" {
		PythonCmd = v
		log.Printf("Using PYTHON_CMD from env: %s", PythonCmd)
	} else {
		searchPaths := []string{
			".",
			"..",
			"../..",
		}

		venvFound := false
		for _, root := range searchPaths {
			possiblePythons := []string{
				filepath.Join(root, ".venv", "Scripts", "python.exe"),
				filepath.Join(root, ".venv", "bin", "python3"),
				filepath.Join(root, ".venv", "bin", "python"),
			}

			for _, p := range possiblePythons {
				if _, err := os.Stat(p); err == nil {
					if absPath, err := filepath.Abs(p); err == nil {
						PythonCmd = absPath
					} else {
						PythonCmd = p
					}
					venvFound = true
					log.Printf("Found project root .venv: %s", PythonCmd)
					break
				}
			}
			if venvFound {
				break
			}
		}

		if !venvFound {
			log.Println("Project .venv not found. Falling back to system python...")
			for _, name := range []string{"python3", "python"} {
				if p, err := exec.LookPath(name); err == nil {
					PythonCmd = p
					break
				}
			}
		}
	}

	if PythonCmd == "" {
		log.Fatal("Python executable not found. Please ensure .venv exists at project root or set PYTHON_CMD.")
	}

	scriptDir := "./script"
	if _, err := os.Stat(scriptDir); os.IsNotExist(err) {
		scriptDir = "../script"
	}

	ScriptAnalyzer = filepath.Join(scriptDir, "session_analyzer.py")

	if v := os.Getenv("DB_PATH"); v != "" {
		DbPath = v
	} else {
		if _, err := os.Stat("./sql"); err == nil {
			DbPath = "./sql/chat.db"
		} else {
			DbPath = "../sql/chat.db"
		}
	}

	if v := os.Getenv("SCHEMA_PATH"); v != "" {
		SchemaPath = v
	} else {
		if _, err := os.Stat("./sql/schema.sql"); err == nil {
			SchemaPath = "./sql/schema.sql"
		} else {
			SchemaPath = "../sql/schema.sql"
		}
	}

	if v := os.Getenv("UPLOAD_DIR"); v != "" {
		DirUpload = v
	} else {
		if _, err := os.Stat("./json/upload"); err == nil {
			DirUpload = "./json/upload"
		} else {
			DirUpload = "../json/upload"
		}
	}

	log.Printf("Config: Python=%s, Scripts=%s, UploadDir=%s, DB=%s, Schema=%s", PythonCmd, scriptDir, DirUpload, DbPath, SchemaPath)
}
