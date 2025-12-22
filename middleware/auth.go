package middleware

import (
	"context"
	"net/http"

	"scuffedsnap/database"
	"scuffedsnap/models"
)

type contextKey string

const UserContextKey contextKey = "user"

// Auth middleware checks for valid session and adds user to context
func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
			return
		}

		session, err := database.GetSession(cookie.Value)
		if err != nil {
			http.Error(w, `{"error": "Invalid session"}`, http.StatusUnauthorized)
			return
		}

		user, err := database.GetUserByID(session.UserID)
		if err != nil {
			http.Error(w, `{"error": "User not found"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserFromContext retrieves the user from the request context
func GetUserFromContext(r *http.Request) *models.User {
	user, ok := r.Context().Value(UserContextKey).(*models.User)
	if !ok {
		return nil
	}
	return user
}

// OptionalAuth tries to authenticate but doesn't fail if not authenticated
func OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		session, err := database.GetSession(cookie.Value)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		user, err := database.GetUserByID(session.UserID)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
