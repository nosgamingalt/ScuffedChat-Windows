package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	"scuffedsnap/models"
)

var DB *sql.DB

// Initialize sets up the PostgreSQL database connection
func Initialize() error {
	// Get PostgreSQL connection string from environment variable
	// Format: postgresql://username:password@host:port/database?sslmode=require
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		// Default connection string for filess.io
		// UPDATE THIS WITH YOUR ACTUAL CONNECTION STRING FROM filess.io
		connStr = "postgresql://username:password@host:port/database?sslmode=require"
		log.Println("WARNING: Using default DATABASE_URL. Set environment variable for production!")
	}

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Test the connection
	if err := DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings (optimized for filess.io)
	DB.SetMaxOpenConns(20)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)
	DB.SetConnMaxIdleTime(1 * time.Minute)

	log.Println("PostgreSQL database connected successfully")
	return nil
}

// User queries

// CreateUser inserts a new user into the database
func CreateUser(username, email, password string) (*models.User, error) {
	user := &models.User{
		Username: username,
		Email:    email,
	}

	query := `
		INSERT INTO scuffedsnap.profiles (username, email, password_hash, created_at) 
		VALUES ($1, $2, $3, NOW())
		RETURNING id, created_at, avatar
	`

	err := DB.QueryRow(query, username, email, password).Scan(
		&user.ID,
		&user.CreatedAt,
		&user.Avatar,
	)
	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByUsername retrieves a user by username
func GetUserByUsername(username string) (*models.User, error) {
	user := &models.User{}
	query := `
		SELECT id, username, email, password_hash, avatar, created_at 
		FROM scuffedsnap.profiles 
		WHERE username = $1
	`

	err := DB.QueryRow(query, username).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.Avatar,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByEmail retrieves a user by email
func GetUserByEmail(email string) (*models.User, error) {
	user := &models.User{}
	query := `
		SELECT id, username, email, password_hash, avatar, created_at 
		FROM scuffedsnap.profiles 
		WHERE email = $1
	`

	err := DB.QueryRow(query, email).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.Avatar,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(id string) (*models.User, error) {
	user := &models.User{}
	query := `
		SELECT id, username, email, avatar, created_at 
		FROM scuffedsnap.profiles 
		WHERE id = $1
	`

	err := DB.QueryRow(query, id).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Avatar,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return user, nil
}

// UpdateUser updates a user's information
func UpdateUser(id string, username, email, avatar string) error {
	query := `
		UPDATE scuffedsnap.profiles 
		SET username = $1, email = $2, avatar = $3 
		WHERE id = $4
	`

	_, err := DB.Exec(query, username, email, avatar, id)
	return err
}

// Session queries

// CreateSession creates a new session for a user
func CreateSession(sessionID, userID string, expiresAt time.Time) error {
	query := `
		INSERT INTO scuffedsnap.sessions (id, user_id, created_at, expires_at) 
		VALUES ($1, $2, NOW(), $3)
	`

	_, err := DB.Exec(query, sessionID, userID, expiresAt)
	return err
}

// GetSession retrieves a session by ID
func GetSession(sessionID string) (*models.Session, error) {
	session := &models.Session{}
	query := `
		SELECT id, user_id, created_at, expires_at 
		FROM scuffedsnap.sessions 
		WHERE id = $1 AND expires_at > NOW()
	`

	err := DB.QueryRow(query, sessionID).Scan(
		&session.ID,
		&session.UserID,
		&session.CreatedAt,
		&session.ExpiresAt,
	)
	if err != nil {
		return nil, err
	}

	return session, nil
}

// DeleteSession removes a session
func DeleteSession(sessionID string) error {
	query := `DELETE FROM scuffedsnap.sessions WHERE id = $1`
	_, err := DB.Exec(query, sessionID)
	return err
}

// CleanupExpiredSessions removes all expired sessions
func CleanupExpiredSessions() error {
	_, err := DB.Exec("SELECT cleanup_expired_sessions()")
	return err
}

// Message queries

// CreateMessage inserts a new message
func CreateMessage(senderID, receiverID, content, msgType string, expiresAt *time.Time) (*models.Message, error) {
	message := &models.Message{
		SenderID:   senderID,
		ReceiverID: receiverID,
		Content:    content,
		Type:       msgType,
	}

	query := `
		INSERT INTO scuffedsnap.messages (sender_id, receiver_id, content, type, expires_at, created_at) 
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING id, created_at
	`

	err := DB.QueryRow(query, senderID, receiverID, content, msgType, expiresAt).Scan(
		&message.ID,
		&message.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	message.ExpiresAt = expiresAt
	return message, nil
}

// GetMessages retrieves messages between two users with limit
func GetMessages(userID, partnerID string, limit int) ([]models.Message, error) {
	query := `
		SELECT id, sender_id, receiver_id, content, type, edited, 
		       updated_at, expires_at, read_at, created_at
		FROM get_conversation_messages($1::UUID, $2::UUID, $3)
		ORDER BY created_at DESC
	`

	rows, err := DB.Query(query, userID, partnerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		var msg models.Message
		err := rows.Scan(
			&msg.ID,
			&msg.SenderID,
			&msg.ReceiverID,
			&msg.Content,
			&msg.Type,
			&msg.Edited,
			&msg.UpdatedAt,
			&msg.ExpiresAt,
			&msg.ReadAt,
			&msg.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	return messages, nil
}

// GetConversations retrieves all conversations for a user (optimized)
func GetConversations(userID string, limit int) ([]map[string]interface{}, error) {
	query := `
		WITH latest_messages AS (
			SELECT DISTINCT ON (
				CASE 
					WHEN sender_id = $1 THEN receiver_id 
					ELSE sender_id 
				END
			)
				CASE 
					WHEN sender_id = $1 THEN receiver_id 
					ELSE sender_id 
				END as partner_id,
				id, sender_id, receiver_id, content, type, 
				read_at, created_at
			FROM scuffedsnap.messages
			WHERE sender_id = $1 OR receiver_id = $1
			ORDER BY 
				CASE 
					WHEN sender_id = $1 THEN receiver_id 
					ELSE sender_id 
				END,
				created_at DESC
		)
		SELECT 
			lm.id, lm.sender_id, lm.receiver_id, lm.content, 
			lm.type, lm.read_at, lm.created_at,
			p.id as partner_id, p.username as partner_username, 
			p.avatar as partner_avatar
		FROM latest_messages lm
		JOIN profiles p ON p.id = lm.partner_id
		ORDER BY lm.created_at DESC
		LIMIT $2
	`

	rows, err := DB.Query(query, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []map[string]interface{}
	for rows.Next() {
		var (
			msgID, senderID, receiverID, content, msgType string
			readAt, createdAt                             *time.Time
			partnerID, partnerUsername, partnerAvatar     string
		)

		err := rows.Scan(
			&msgID, &senderID, &receiverID, &content, &msgType,
			&readAt, &createdAt,
			&partnerID, &partnerUsername, &partnerAvatar,
		)
		if err != nil {
			return nil, err
		}

		conversations = append(conversations, map[string]interface{}{
			"id":              msgID,
			"sender_id":       senderID,
			"receiver_id":     receiverID,
			"content":         content,
			"type":            msgType,
			"read_at":         readAt,
			"created_at":      createdAt,
			"partner_id":      partnerID,
			"partner_username": partnerUsername,
			"partner_avatar":  partnerAvatar,
		})
	}

	return conversations, nil
}

// MarkMessageAsRead marks a message as read
func MarkMessageAsRead(messageID, userID string) error {
	query := `
		UPDATE scuffedsnap.messages 
		SET read_at = NOW() 
		WHERE id = $1 AND receiver_id = $2 AND read_at IS NULL
	`

	_, err := DB.Exec(query, messageID, userID)
	return err
}

// UpdateMessage updates a message's content
func UpdateMessage(messageID, senderID, content string) error {
	query := `
		UPDATE scuffedsnap.messages 
		SET content = $1, edited = true, updated_at = NOW() 
		WHERE id = $2 AND sender_id = $3
	`

	_, err := DB.Exec(query, content, messageID, senderID)
	return err
}

// DeleteMessage deletes a message
func DeleteMessage(messageID, userID string) error {
	query := `DELETE FROM scuffedsnap.messages WHERE id = $1 AND sender_id = $2`
	_, err := DB.Exec(query, messageID, userID)
	return err
}

// CleanupExpiredMessages removes all expired messages
func CleanupExpiredMessages() error {
	_, err := DB.Exec("SELECT cleanup_expired_messages()")
	return err
}

// Friend queries

// CreateFriendRequest creates a new friend request
func CreateFriendRequest(userID, friendID string) error {
	query := `
		INSERT INTO scuffedsnap.friends (user_id, friend_id, status, created_at) 
		VALUES ($1, $2, 'pending', NOW())
	`

	_, err := DB.Exec(query, userID, friendID)
	return err
}

// GetFriends retrieves all accepted friends for a user
func GetFriends(userID string) ([]models.Friend, error) {
	query := `
		SELECT f.id, f.user_id, f.friend_id, f.status, f.created_at,
		       p.username, p.avatar
		FROM scuffedsnap.friends f
		JOIN profiles p ON p.id = f.friend_id
		WHERE f.user_id = $1 AND f.status = 'accepted'
		ORDER BY p.username
	`

	rows, err := DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var friends []models.Friend
	for rows.Next() {
		var friend models.Friend
		err := rows.Scan(
			&friend.ID,
			&friend.UserID,
			&friend.FriendID,
			&friend.Status,
			&friend.CreatedAt,
			&friend.Username,
			&friend.Avatar,
		)
		if err != nil {
			return nil, err
		}
		friends = append(friends, friend)
	}

	return friends, nil
}

// GetFriendRequests retrieves pending friend requests for a user
func GetFriendRequests(userID string) ([]models.Friend, error) {
	query := `
		SELECT f.id, f.user_id, f.friend_id, f.status, f.created_at,
		       p.username, p.avatar
		FROM scuffedsnap.friends f
		JOIN profiles p ON p.id = f.user_id
		WHERE f.friend_id = $1 AND f.status = 'pending'
		ORDER BY f.created_at DESC
	`

	rows, err := DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.Friend
	for rows.Next() {
		var friend models.Friend
		err := rows.Scan(
			&friend.ID,
			&friend.UserID,
			&friend.FriendID,
			&friend.Status,
			&friend.CreatedAt,
			&friend.Username,
			&friend.Avatar,
		)
		if err != nil {
			return nil, err
		}
		requests = append(requests, friend)
	}

	return requests, nil
}

// UpdateFriendRequest updates a friend request status
func UpdateFriendRequest(requestID, userID, status string) error {
	query := `
		UPDATE scuffedsnap.friends 
		SET status = $1 
		WHERE id = $2 AND friend_id = $3
	`

	_, err := DB.Exec(query, status, requestID, userID)
	return err
}

// DeleteFriend removes a friendship
func DeleteFriend(userID, friendID string) error {
	query := `
		DELETE FROM scuffedsnap.friends 
		WHERE (user_id = $1 AND friend_id = $2) 
		   OR (user_id = $2 AND friend_id = $1)
	`

	_, err := DB.Exec(query, userID, friendID)
	return err
}

// SearchUsers searches for users by username (excluding current user and existing friends)
func SearchUsers(currentUserID, searchQuery string, limit int) ([]models.User, error) {
	query := `
		SELECT p.id, p.username, p.avatar
		FROM scuffedsnap.profiles p
		WHERE p.id != $1
		  AND p.username ILIKE $2
		  AND NOT EXISTS (
			SELECT 1 FROM scuffedsnap.friends f 
			WHERE (f.user_id = $1 AND f.friend_id = p.id)
			   OR (f.user_id = p.id AND f.friend_id = $1)
		  )
		ORDER BY p.username
		LIMIT $3
	`

	rows, err := DB.Query(query, currentUserID, "%"+searchQuery+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		err := rows.Scan(&user.ID, &user.Username, &user.Avatar)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}

	return users, nil
}
