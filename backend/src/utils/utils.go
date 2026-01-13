package utils

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"

	"sale-analysis-backend/src/config"
	"sale-analysis-backend/src/models"
)

func RunPythonScript(scriptPath, inputPath string) (string, error) {
	cmd := exec.Command(config.PythonCmd, scriptPath, inputPath)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("script execution failed: %v | stderr: %s | stdout: %s", err, strings.TrimSpace(stderr.String()), strings.TrimSpace(stdout.String()))
	}

	outStr := strings.TrimSpace(stdout.String())
	if outStr != "" {
		lines := strings.Split(outStr, "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(lines[i])
			if line != "" {
				return line, nil
			}
		}
	}

	combined := strings.TrimSpace(stderr.String() + "\n" + stdout.String())
	lines := strings.Split(combined, "\n")
	for _, line := range lines {
		if strings.Contains(line, "Success: Saved") {
			parts := strings.Split(line, " to ")
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1]), nil
			}
		}
	}

	return "", errors.New("could not find output path in python script output")
}

func ValidateJSONFormat(filePath string) bool {
	file, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer file.Close()

	var data models.InputJSON
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&data); err != nil {
		return false
	}

	if len(data.Messages) == 0 {
		return false
	}

	firstMsg := data.Messages[0]
	if firstMsg.SenderName == "" || firstMsg.Timestamp == "" || firstMsg.Content == "" {
		return false
	}

	return true
}

func JSONResponse(w http.ResponseWriter, code int, success bool, msg string, data interface{}) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": success,
		"message": msg,
		"data":    data,
	})
}

func CorsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}
