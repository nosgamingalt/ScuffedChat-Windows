package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️  No .env file found, using environment variables")
	}

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Static files
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("./static"))))

	// API endpoint for config
	http.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		config := map[string]string{
			"supabaseUrl":    os.Getenv("SUPABASE_URL"),
			"supabaseAnonKey": os.Getenv("SUPABASE_ANON_KEY"),
		}
		json.NewEncoder(w).Encode(config)
	})

	// HTML pages
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/index.html")
	})
	http.HandleFunc("/app", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/app.html")
	})
	http.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/admin.html")
	})

	// Start server
	log.Printf("🚀 ScuffedSnap server starting on http://localhost:%s\n", port)
	log.Printf("📱 Open your browser and navigate to http://localhost:%s\n", port)
	log.Println("✅ Using Supabase for authentication and database")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
