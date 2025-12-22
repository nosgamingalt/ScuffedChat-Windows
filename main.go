package main

import (
	"log"
	"net/http"
)

func main() {
	// Serve static files
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// HTML pages
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./static/index.html")
			return
		}
		http.NotFound(w, r)
	})

	http.HandleFunc("/app", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/app.html")
	})

	// Start server
	log.Println("🚀 ScuffedSnap server starting on http://localhost:8080")
	log.Println("📱 Open your browser and navigate to http://localhost:8080")
	log.Println("💾 Using Supabase for database")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
