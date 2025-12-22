package models

import "time"

// FriendStatus represents the status of a friend request
type FriendStatus string

const (
	FriendStatusPending  FriendStatus = "pending"
	FriendStatusAccepted FriendStatus = "accepted"
	FriendStatusBlocked  FriendStatus = "blocked"
)

// Friend represents a friendship between two users
type Friend struct {
	ID        int64        `json:"id"`
	UserID    int64        `json:"user_id"`
	FriendID  int64        `json:"friend_id"`
	Status    FriendStatus `json:"status"`
	CreatedAt time.Time    `json:"created_at"`
}

// FriendWithUser includes the friend's user info
type FriendWithUser struct {
	Friend
	User UserResponse `json:"user"`
}

// FriendRequest represents an incoming friend request
type FriendRequest struct {
	ID        int64        `json:"id"`
	From      UserResponse `json:"from"`
	Status    FriendStatus `json:"status"`
	CreatedAt time.Time    `json:"created_at"`
}
