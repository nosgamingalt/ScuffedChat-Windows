package models

import "time"

// User represents a user in the system
type User struct {
	ID         int64     `json:"id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	Password   string    `json:"-"` // Never send password in JSON
	Avatar     string    `json:"avatar"`
	AuthMethod string    `json:"auth_method"`
	IsDisabled bool      `json:"is_disabled"`
	CreatedAt  time.Time `json:"created_at"`
}

// UserResponse is the safe version of User for API responses
type UserResponse struct {
	ID         int64     `json:"id"`
	Username   string    `json:"username"`
	Email      string    `json:"email"`
	Avatar     string    `json:"avatar"`
	AuthMethod string    `json:"auth_method"`
	IsDisabled bool      `json:"is_disabled"`
	CreatedAt  time.Time `json:"created_at"`
	Online     bool      `json:"online"`
}

// ToResponse converts User to UserResponse
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:         u.ID,
		Username:   u.Username,
		Email:      u.Email,
		Avatar:     u.Avatar,
		AuthMethod: u.AuthMethod,
		IsDisabled: u.IsDisabled,
		CreatedAt:  u.CreatedAt,
		Online:     false,
	}
}
