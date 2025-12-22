package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"

	"scuffedsnap/database"
	"scuffedsnap/middleware"
	"scuffedsnap/models"
)

type sendMessageRequest struct {
	ReceiverID int64  `json:"receiver_id"`
	Content    string `json:"content"`
	Type       string `json:"type"`
	Disappear  bool   `json:"disappear"` // If true, message expires after being read
}

// GetConversations returns all conversations for the current user
func GetConversations(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	conversations, err := database.GetConversations(user.ID)
	if err != nil {
		http.Error(w, `{"error": "Failed to get conversations"}`, http.StatusInternalServerError)
		return
	}

	// Add online status
	for i := range conversations {
		conversations[i].User.Online = IsUserOnline(conversations[i].User.ID)
	}

	if conversations == nil {
		conversations = []models.Conversation{}
	}

	json.NewEncoder(w).Encode(conversations)
}

// GetMessages returns messages between current user and another user
func GetMessages(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	otherUserID, err := strconv.ParseInt(vars["userId"], 10, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid user ID"}`, http.StatusBadRequest)
		return
	}

	// Get pagination params
	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	messages, err := database.GetMessagesBetweenUsers(user.ID, otherUserID, limit, offset)
	if err != nil {
		http.Error(w, `{"error": "Failed to get messages"}`, http.StatusInternalServerError)
		return
	}

	// Mark messages as read
	database.MarkMessagesAsRead(otherUserID, user.ID)

	if messages == nil {
		messages = []models.MessageWithSender{}
	}

	json.NewEncoder(w).Encode(messages)
}

// SendMessage creates a new message
func SendMessage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		http.Error(w, `{"error": "Message content is required"}`, http.StatusBadRequest)
		return
	}

	if req.Type == "" {
		req.Type = "text"
	}

	// Check if receiver exists
	receiver, err := database.GetUserByID(req.ReceiverID)
	if err != nil {
		http.Error(w, `{"error": "Recipient not found"}`, http.StatusNotFound)
		return
	}

	// Set expiration for disappearing messages (24 hours if not read)
	var expiresAt *time.Time
	if req.Disappear {
		t := time.Now().Add(24 * time.Hour)
		expiresAt = &t
	}

	message, err := database.CreateMessage(user.ID, receiver.ID, req.Content, req.Type, expiresAt)
	if err != nil {
		http.Error(w, `{"error": "Failed to send message"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast via WebSocket
	BroadcastMessage(receiver.ID, models.WebSocketMessage{
		Type: "message",
		Payload: models.MessageWithSender{
			Message:        *message,
			SenderUsername: user.Username,
			SenderAvatar:   user.Avatar,
		},
	})

	json.NewEncoder(w).Encode(message)
}

// MarkAsRead marks messages from a user as read
func MarkAsRead(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	user := middleware.GetUserFromContext(r)
	if user == nil {
		http.Error(w, `{"error": "Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	senderID, err := strconv.ParseInt(vars["userId"], 10, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid user ID"}`, http.StatusBadRequest)
		return
	}

	if err := database.MarkMessagesAsRead(senderID, user.ID); err != nil {
		http.Error(w, `{"error": "Failed to mark as read"}`, http.StatusInternalServerError)
		return
	}

	// Notify sender that messages were read
	BroadcastMessage(senderID, models.WebSocketMessage{
		Type: "read",
		Payload: map[string]int64{
			"reader_id": user.ID,
		},
	})

	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

