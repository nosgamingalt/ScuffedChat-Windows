package database

import (
	"database/sql"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
	"scuffedsnap/models"
)

var DB *sql.DB

// Initialize sets up the database connection and creates tables
func Initialize() error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	var err error
	DB, err = sql.Open("postgres", databaseURL)
	if err != nil {
		return err
	}

	// Test connection
	if err := DB.Ping(); err != nil {
		return err
	}

	// Set connection pool settings
	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)

	// Create tables
	if err := createTables(); err != nil {
		return err
	}

	log.Println("Database initialized successfully")
	return nil
}

func createTables() error {
	tables := `
	CREATE TABLE IF NOT EXISTS users (
		id BIGSERIAL PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		avatar TEXT DEFAULT '',
		auth_method TEXT DEFAULT 'email',
		is_disabled BOOLEAN DEFAULT FALSE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id BIGINT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		expires_at TIMESTAMP NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS messages (
		id BIGSERIAL PRIMARY KEY,
		sender_id BIGINT NOT NULL,
		receiver_id BIGINT NOT NULL,
		content TEXT NOT NULL,
		type TEXT DEFAULT 'text',
		expires_at TIMESTAMP,
		read_at TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS friends (
		id BIGSERIAL PRIMARY KEY,
		user_id BIGINT NOT NULL,
		friend_id BIGINT NOT NULL,
		status TEXT DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(user_id, friend_id)
	);

	CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
	CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
	CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
	CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
	CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
	`

	_, err := DB.Exec(tables)
	return err
}

// User queries

// CreateUser inserts a new user into the database
func CreateUser(username, email, password string) (*models.User, error) {
	return CreateUserWithAuth(username, email, password, "email")
}

// CreateUserWithAuth inserts a new user with auth method tracking
func CreateUserWithAuth(username, email, password, authMethod string) (*models.User, error) {
	result, err := DB.Exec(
		"INSERT INTO users (username, email, password, auth_method) VALUES (?, ?, ?, ?)",
		username, email, password, authMethod,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return GetUserByID(id)
}

// GetUserByID retrieves a user by their ID
func GetUserByID(id int64) (*models.User, error) {
	user := &models.User{}
	err := DB.QueryRow(
		"SELECT id, username, email, password, avatar, created_at, COALESCE(auth_method, 'email'), COALESCE(is_disabled, 0) FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Password, &user.Avatar, &user.CreatedAt, &user.AuthMethod, &user.IsDisabled)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// GetUserByUsername retrieves a user by their username
func GetUserByUsername(username string) (*models.User, error) {
	user := &models.User{}
	err := DB.QueryRow(
		"SELECT id, username, email, password, avatar, created_at, COALESCE(auth_method, 'email'), COALESCE(is_disabled, 0) FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Password, &user.Avatar, &user.CreatedAt, &user.AuthMethod, &user.IsDisabled)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// GetUserByEmail retrieves a user by their email
func GetUserByEmail(email string) (*models.User, error) {
	user := &models.User{}
	err := DB.QueryRow(
		"SELECT id, username, email, password, avatar, created_at, COALESCE(auth_method, 'email'), COALESCE(is_disabled, 0) FROM users WHERE email = ?",
		email,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Password, &user.Avatar, &user.CreatedAt, &user.AuthMethod, &user.IsDisabled)
	if err != nil {
		return nil, err
	}
	return user, nil
}

// SearchUsers searches for users by username
func SearchUsers(query string, currentUserID int64) ([]models.UserResponse, error) {
	rows, err := DB.Query(
		`SELECT id, username, email, avatar, created_at FROM users 
		WHERE username LIKE ? AND id != ? LIMIT 20`,
		"%"+query+"%", currentUserID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.UserResponse
	for rows.Next() {
		var user models.UserResponse
		if err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.Avatar, &user.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

// Session queries

// CreateSession creates a new session for a user
func CreateSession(sessionID string, userID int64, expiresAt time.Time) error {
	_, err := DB.Exec(
		"INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
		sessionID, userID, expiresAt,
	)
	return err
}

// GetSession retrieves a session by its ID
func GetSession(sessionID string) (*models.Session, error) {
	session := &models.Session{}
	err := DB.QueryRow(
		"SELECT id, user_id, created_at, expires_at FROM sessions WHERE id = ? AND expires_at > datetime('now')",
		sessionID,
	).Scan(&session.ID, &session.UserID, &session.CreatedAt, &session.ExpiresAt)
	if err != nil {
		return nil, err
	}
	return session, nil
}

// DeleteSession removes a session
func DeleteSession(sessionID string) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

// DeleteUserSessions removes all sessions for a user
func DeleteUserSessions(userID int64) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	return err
}

// Message queries

// CreateMessage creates a new message
func CreateMessage(senderID, receiverID int64, content, msgType string, expiresAt *time.Time) (*models.Message, error) {
	result, err := DB.Exec(
		"INSERT INTO messages (sender_id, receiver_id, content, type, expires_at) VALUES (?, ?, ?, ?, ?)",
		senderID, receiverID, content, msgType, expiresAt,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return GetMessageByID(id)
}

// GetMessageByID retrieves a message by its ID
func GetMessageByID(id int64) (*models.Message, error) {
	msg := &models.Message{}
	err := DB.QueryRow(
		"SELECT id, sender_id, receiver_id, content, type, expires_at, read_at, created_at FROM messages WHERE id = ?",
		id,
	).Scan(&msg.ID, &msg.SenderID, &msg.ReceiverID, &msg.Content, &msg.Type, &msg.ExpiresAt, &msg.ReadAt, &msg.CreatedAt)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

// GetMessagesBetweenUsers retrieves messages between two users
func GetMessagesBetweenUsers(userID1, userID2 int64, limit, offset int) ([]models.MessageWithSender, error) {
	rows, err := DB.Query(
		`SELECT m.id, m.sender_id, m.receiver_id, m.content, m.type, m.expires_at, m.read_at, m.created_at,
		        u.username, u.avatar
		FROM messages m
		JOIN users u ON m.sender_id = u.id
		WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
		  AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
		ORDER BY m.created_at DESC
		LIMIT ? OFFSET ?`,
		userID1, userID2, userID2, userID1, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.MessageWithSender
	for rows.Next() {
		var msg models.MessageWithSender
		if err := rows.Scan(
			&msg.ID, &msg.SenderID, &msg.ReceiverID, &msg.Content, &msg.Type,
			&msg.ExpiresAt, &msg.ReadAt, &msg.CreatedAt,
			&msg.SenderUsername, &msg.SenderAvatar,
		); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	// Reverse to get chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}

// GetConversations retrieves all conversations for a user
func GetConversations(userID int64) ([]models.Conversation, error) {
	rows, err := DB.Query(
		`SELECT DISTINCT 
			CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as other_user_id
		FROM messages m
		WHERE m.sender_id = ? OR m.receiver_id = ?
		ORDER BY m.created_at DESC`,
		userID, userID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []models.Conversation
	seen := make(map[int64]bool)

	for rows.Next() {
		var otherUserID int64
		if err := rows.Scan(&otherUserID); err != nil {
			return nil, err
		}

		if seen[otherUserID] {
			continue
		}
		seen[otherUserID] = true

		user, err := GetUserByID(otherUserID)
		if err != nil {
			continue
		}

		// Get last message
		var lastMsg models.Message
		err = DB.QueryRow(
			`SELECT id, sender_id, receiver_id, content, type, expires_at, read_at, created_at
			FROM messages
			WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
			  AND (expires_at IS NULL OR expires_at > datetime('now'))
			ORDER BY created_at DESC LIMIT 1`,
			userID, otherUserID, otherUserID, userID,
		).Scan(&lastMsg.ID, &lastMsg.SenderID, &lastMsg.ReceiverID, &lastMsg.Content,
			&lastMsg.Type, &lastMsg.ExpiresAt, &lastMsg.ReadAt, &lastMsg.CreatedAt)

		// Count unread messages
		var unreadCount int
		DB.QueryRow(
			`SELECT COUNT(*) FROM messages
			WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL`,
			otherUserID, userID,
		).Scan(&unreadCount)

		conv := models.Conversation{
			User:        user.ToResponse(),
			UnreadCount: unreadCount,
		}
		if err == nil {
			conv.LastMessage = &lastMsg
		}

		conversations = append(conversations, conv)
	}

	return conversations, nil
}

// MarkMessagesAsRead marks all messages from a sender to receiver as read
func MarkMessagesAsRead(senderID, receiverID int64) error {
	_, err := DB.Exec(
		"UPDATE messages SET read_at = datetime('now') WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL",
		senderID, receiverID,
	)
	return err
}

// DeleteExpiredMessages removes messages that have expired
func DeleteExpiredMessages() error {
	_, err := DB.Exec("DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at < datetime('now')")
	return err
}

// Friend queries

// CreateFriendRequest creates a friend request
func CreateFriendRequest(userID, friendID int64) error {
	_, err := DB.Exec(
		"INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')",
		userID, friendID,
	)
	return err
}

// GetFriendship retrieves a friendship record
func GetFriendship(userID, friendID int64) (*models.Friend, error) {
	friend := &models.Friend{}
	err := DB.QueryRow(
		`SELECT id, user_id, friend_id, status, created_at FROM friends 
		WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
		userID, friendID, friendID, userID,
	).Scan(&friend.ID, &friend.UserID, &friend.FriendID, &friend.Status, &friend.CreatedAt)
	if err != nil {
		return nil, err
	}
	return friend, nil
}

// AcceptFriendRequest accepts a pending friend request
func AcceptFriendRequest(requestID int64, userID int64) error {
	result, err := DB.Exec(
		"UPDATE friends SET status = 'accepted' WHERE id = ? AND friend_id = ? AND status = 'pending'",
		requestID, userID,
	)
	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// GetFriends retrieves all accepted friends for a user
func GetFriends(userID int64) ([]models.UserResponse, error) {
	rows, err := DB.Query(
		`SELECT u.id, u.username, u.email, u.avatar, u.created_at
		FROM users u
		JOIN friends f ON (f.user_id = u.id OR f.friend_id = u.id)
		WHERE ((f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted')
		  AND u.id != ?`,
		userID, userID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var friends []models.UserResponse
	seen := make(map[int64]bool)
	for rows.Next() {
		var user models.UserResponse
		if err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.Avatar, &user.CreatedAt); err != nil {
			return nil, err
		}
		if !seen[user.ID] {
			friends = append(friends, user)
			seen[user.ID] = true
		}
	}
	return friends, nil
}

// GetPendingFriendRequests retrieves pending friend requests for a user
func GetPendingFriendRequests(userID int64) ([]models.FriendRequest, error) {
	rows, err := DB.Query(
		`SELECT f.id, u.id, u.username, u.email, u.avatar, u.created_at, f.status, f.created_at
		FROM friends f
		JOIN users u ON f.user_id = u.id
		WHERE f.friend_id = ? AND f.status = 'pending'`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []models.FriendRequest
	for rows.Next() {
		var req models.FriendRequest
		var userCreatedAt time.Time
		if err := rows.Scan(
			&req.ID, &req.From.ID, &req.From.Username, &req.From.Email,
			&req.From.Avatar, &userCreatedAt, &req.Status, &req.CreatedAt,
		); err != nil {
			return nil, err
		}
		req.From.CreatedAt = userCreatedAt
		requests = append(requests, req)
	}
	return requests, nil
}

// DeleteFriend removes a friendship
func DeleteFriend(userID, friendID int64) error {
	_, err := DB.Exec(
		"DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
		userID, friendID, friendID, userID,
	)
	return err
}

// Admin functions

// GetAllUsers returns all users with their active session info
func GetAllUsers() ([]models.UserResponse, error) {
	rows, err := DB.Query(`
		SELECT u.id, u.username, u.email, u.avatar, u.created_at, 
		       COALESCE(u.auth_method, 'email'), COALESCE(u.is_disabled, 0),
		       CASE WHEN s.id IS NOT NULL THEN 1 ELSE 0 END as online
		FROM users u
		LEFT JOIN sessions s ON u.id = s.user_id AND s.expires_at > datetime('now')
		ORDER BY u.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.UserResponse
	for rows.Next() {
		var user models.UserResponse
		err := rows.Scan(&user.ID, &user.Username, &user.Email, &user.Avatar, 
			&user.CreatedAt, &user.AuthMethod, &user.IsDisabled, &user.Online)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

// DisableUser disables or enables a user account
func DisableUser(userID int64, disabled bool) error {
	disabledInt := 0
	if disabled {
		disabledInt = 1
	}
	_, err := DB.Exec("UPDATE users SET is_disabled = ? WHERE id = ?", disabledInt, userID)
	return err
}

// ResetUserPassword resets a user's password
func ResetUserPassword(userID int64, newPassword string) error {
	_, err := DB.Exec("UPDATE users SET password = ? WHERE id = ?", newPassword, userID)
	return err
}

// DeleteAllUserSessions deletes all sessions for a user (force logout)
func DeleteAllUserSessions(userID int64) error {
	_, err := DB.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	return err
}
