package models

import "time"

// Message represents a chat message between users
type Message struct {
	ID         int64      `json:"id"`
	SenderID   int64      `json:"sender_id"`
	ReceiverID int64      `json:"receiver_id"`
	Content    string     `json:"content"`
	Type       string     `json:"type"` // "text", "image", "snap"
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	ReadAt     *time.Time `json:"read_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// MessageWithSender includes sender info for display
type MessageWithSender struct {
	Message
	SenderUsername string `json:"sender_username"`
	SenderAvatar   string `json:"sender_avatar"`
}

// Conversation represents a chat thread with another user
type Conversation struct {
	User        UserResponse `json:"user"`
	LastMessage *Message     `json:"last_message,omitempty"`
	UnreadCount int          `json:"unread_count"`
}

// WebSocketMessage is the format for real-time messages
type WebSocketMessage struct {
	Type    string      `json:"type"` // "message", "typing", "read", "online"
	Payload interface{} `json:"payload"`
}
