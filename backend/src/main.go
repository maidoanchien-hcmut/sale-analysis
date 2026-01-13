package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"sale-analysis-backend/src/config"
	"sale-analysis-backend/src/database"
	"sale-analysis-backend/src/handlers"
	"sale-analysis-backend/src/utils"
)

const (
	Port = ":8080"
)

func main() {
	config.Init()
	database.Init()

	os.MkdirAll(config.DirSample, 0755)

	http.HandleFunc("/api/process", utils.CorsMiddleware(handlers.HandleProcess))
	http.HandleFunc("/api/dashboard", utils.CorsMiddleware(handlers.HandleDashboard))

	fmt.Printf("Server running at http://localhost%s\n", Port)
	log.Fatal(http.ListenAndServe(Port, nil))
}
