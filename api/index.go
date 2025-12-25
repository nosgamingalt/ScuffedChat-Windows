package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Handler is the serverless function entry point for Vercel
func Handler(w http.ResponseWriter, r *http.Request) {
	// API endpoint for config
	if r.URL.Path == "/api/config" {
		w.Header().Set("Content-Type", "application/json")
		config := map[string]string{
			"supabaseUrl":    os.Getenv("SUPABASE_URL"),
			"supabaseAnonKey": os.Getenv("SUPABASE_ANON_KEY"),
		}
		json.NewEncoder(w).Encode(config)
		return
	}

	// Serve static files
	if r.URL.Path == "/" {
		serveFile(w, r, "static/index.html")
		return
	}

	if r.URL.Path == "/app" {
		serveFile(w, r, "static/app.html")
		return
	}

	// Handle static assets
	if len(r.URL.Path) > 8 && r.URL.Path[:8] == "/static/" {
		serveFile(w, r, r.URL.Path[1:]) // Remove leading /
		return
	}

	// Add API routes here if needed
	// For now, just serve the index for any other route
	serveFile(w, r, "static/index.html")
}

func serveFile(w http.ResponseWriter, r *http.Request, path string) {
	// Try to read the file
	data, err := os.ReadFile(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// Set content type based on file extension
	contentType := getContentType(path)
	w.Header().Set("Content-Type", contentType)
	w.Write(data)
}

func getContentType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	
	switch ext {
	case ".html":
		return "text/html"
	case ".css":
		return "text/css"
	case ".js":
		return "application/javascript"
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	case ".woff", ".woff2":
		return "font/woff2"
	case ".ttf":
		return "font/ttf"
	default:
		return "text/plain"
	}
}
