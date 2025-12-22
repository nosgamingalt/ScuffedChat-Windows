package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"scuffedsnap/database"
	"scuffedsnap/middleware"
	"scuffedsnap/models"
)

type addFriendRequest struct {
	Username string `json:"username"`
}

// GetFriends returns all friends for the current user
func GetFriends(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	friends, err := database.GetFriends(user.ID)
	if err != nil {
		http.Error(w, `{"error": "Failed to get friends"}`, http.StatusInternalServerError)
		return
	}

	// Add online status
	for i := range friends {
		friends[i].Online = IsUserOnline(friends[i].ID)
	}

	if friends == nil {
		friends = []models.UserResponse{}
	}

	json.NewEncoder(w).Encode(friends)
}

// GetFriendRequests returns pending friend requests for the current user
func GetFriendRequests(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	requests, err := database.GetPendingFriendRequests(user.ID)
	if err != nil {
		http.Error(w, `{"error": "Failed to get friend requests"}`, http.StatusInternalServerError)
		return
	}

	if requests == nil {
		requests = []models.FriendRequest{}
	}

	json.NewEncoder(w).Encode(requests)
}

// AddFriend sends a friend request
func AddFriend(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req addFriendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Find user by username
	friend, err := database.GetUserByUsername(req.Username)
	if err != nil {
		http.Error(w, `{"error": "User not found"}`, http.StatusNotFound)
		return
	}

	if friend.ID == user.ID {
		http.Error(w, `{"error": "You cannot add yourself as a friend"}`, http.StatusBadRequest)
		return
	}

	// Check if friendship already exists
	existing, _ := database.GetFriendship(user.ID, friend.ID)
	if existing != nil {
		if existing.Status == models.FriendStatusAccepted {
			http.Error(w, `{"error": "Already friends"}`, http.StatusConflict)
		} else if existing.Status == models.FriendStatusPending {
			http.Error(w, `{"error": "Friend request already pending"}`, http.StatusConflict)
		} else {
			http.Error(w, `{"error": "Cannot add this user"}`, http.StatusConflict)
		}
		return
	}

	// Create friend request
	if err := database.CreateFriendRequest(user.ID, friend.ID); err != nil {
		http.Error(w, `{"error": "Failed to send friend request"}`, http.StatusInternalServerError)
		return
	}

	// Notify the friend via WebSocket
	BroadcastMessage(friend.ID, models.WebSocketMessage{
		Type: "friend_request",
		Payload: map[string]interface{}{
			"from": user.ToResponse(),
		},
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Friend request sent",
	})
}

// AcceptFriend accepts a friend request
func AcceptFriend(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	requestID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid request ID"}`, http.StatusBadRequest)
		return
	}

	if err := database.AcceptFriendRequest(requestID, user.ID); err != nil {
		http.Error(w, `{"error": "Failed to accept friend request"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Friend request accepted",
	})
}

// RemoveFriend removes a friend
func RemoveFriend(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	friendID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid friend ID"}`, http.StatusBadRequest)
		return
	}

	if err := database.DeleteFriend(user.ID, friendID); err != nil {
		http.Error(w, `{"error": "Failed to remove friend"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Friend removed",
	})
}

// SearchUsers searches for users by username
func SearchUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		json.NewEncoder(w).Encode([]models.UserResponse{})
		return
	}

	users, err := database.SearchUsers(query, user.ID)
	if err != nil {
		http.Error(w, `{"error": "Search failed"}`, http.StatusInternalServerError)
		return
	}

	if users == nil {
		users = []models.UserResponse{}
	}

	json.NewEncoder(w).Encode(users)
}
