package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"scuffedsnap/database"
	"scuffedsnap/middleware"
)

type signupRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Signup handles user registration
func Signup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate input
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if len(req.Username) < 3 || len(req.Username) > 20 {
		http.Error(w, `{"error": "Username must be 3-20 characters"}`, http.StatusBadRequest)
		return
	}

	if !strings.Contains(req.Email, "@") {
		http.Error(w, `{"error": "Invalid email address"}`, http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 {
		http.Error(w, `{"error": "Password must be at least 6 characters"}`, http.StatusBadRequest)
		return
	}

	// Check if username exists
	if _, err := database.GetUserByUsername(req.Username); err == nil {
		http.Error(w, `{"error": "Username already taken"}`, http.StatusConflict)
		return
	}

	// Check if email exists
	if _, err := database.GetUserByEmail(req.Email); err == nil {
		http.Error(w, `{"error": "Email already registered"}`, http.StatusConflict)
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, `{"error": "Server error"}`, http.StatusInternalServerError)
		return
	}

	// Create user
	user, err := database.CreateUser(req.Username, req.Email, string(hashedPassword))
	if err != nil {
		http.Error(w, `{"error": "Failed to create user"}`, http.StatusInternalServerError)
		return
	}

	// Create session
	sessionID := generateSessionID()
	expiresAt := time.Now().Add(7 * 24 * time.Hour) // 7 days
	if err := database.CreateSession(sessionID, user.ID, expiresAt); err != nil {
		http.Error(w, `{"error": "Failed to create session"}`, http.StatusInternalServerError)
		return
	}

	// Set cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"user":    user.ToResponse(),
	})
}

// Login handles user authentication
func Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)

	// Get user
	user, err := database.GetUserByUsername(req.Username)
	if err != nil {
		// Try email
		user, err = database.GetUserByEmail(strings.ToLower(req.Username))
		if err != nil {
			http.Error(w, `{"error": "Invalid username or password"}`, http.StatusUnauthorized)
			return
		}
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		http.Error(w, `{"error": "Invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	// Create session
	sessionID := generateSessionID()
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	if err := database.CreateSession(sessionID, user.ID, expiresAt); err != nil {
		http.Error(w, `{"error": "Failed to create session"}`, http.StatusInternalServerError)
		return
	}

	// Set cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"user":    user.ToResponse(),
	})
}

// Logout handles user logout
func Logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	cookie, err := r.Cookie("session")
	if err == nil {
		database.DeleteSession(cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
	})

	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// Me returns the current authenticated user
func Me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Not authenticated"}`, http.StatusUnauthorized)
		return
	}

	json.NewEncoder(w).Encode(user.ToResponse())
}

func generateSessionID() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
