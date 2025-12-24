-- ScuffedSnap PostgreSQL 17 Schema
-- For use with filess.io PostgreSQL database
-- Run this in your filess.io SQL panel

-- Create our own schema (you have permission for this)
CREATE SCHEMA IF NOT EXISTS scuffedsnap;
SET search_path TO scuffedsnap;

-- Create profiles table (users)
CREATE TABLE IF NOT EXISTS scuffedsnap.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sessions table (for authentication)
CREATE TABLE IF NOT EXISTS scuffedsnap.sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES scuffedsnap.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Create messages table
CREATE TABLE IF NOT EXISTS scuffedsnap.messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES scuffedsnap.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES scuffedsnap.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    edited BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create friends table
CREATE TABLE IF NOT EXISTS scuffedsnap.friends (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES scuffedsnap.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES scuffedsnap.profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- Create optimized indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON scuffedsnap.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON scuffedsnap.profiles(email);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON scuffedsnap.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON scuffedsnap.sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON scuffedsnap.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON scuffedsnap.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON scuffedsnap.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON scuffedsnap.messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read ON scuffedsnap.messages(receiver_id, read_at) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_friends_user ON scuffedsnap.friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON scuffedsnap.friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON scuffedsnap.friends(status);
CREATE INDEX IF NOT EXISTS idx_friends_user_status ON scuffedsnap.friends(user_id, friend_id, status);

-- Automatic cleanup function for expired messages
CREATE OR REPLACE FUNCTION scuffedsnap.cleanup_expired_messages()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM scuffedsnap.messages
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

-- Automatic cleanup function for expired sessions
CREATE OR REPLACE FUNCTION scuffedsnap.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM scuffedsnap.sessions
    WHERE expires_at < NOW();
END;
$$;

-- Optimized function to get conversation messages
CREATE OR REPLACE FUNCTION scuffedsnap.get_conversation_messages(p_user_id UUID, p_partner_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
    id BIGINT,
    sender_id UUID,
    receiver_id UUID,
    content TEXT,
    type TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    edited BOOLEAN,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.sender_id, m.receiver_id, m.content, m.type, 
           m.created_at, m.expires_at, m.edited, m.updated_at
    FROM scuffedsnap.messages m
    WHERE (m.sender_id = p_user_id AND m.receiver_id = p_partner_id)
       OR (m.sender_id = p_partner_id AND m.receiver_id = p_user_id)
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Add helpful comments
COMMENT ON TABLE scuffedsnap.profiles IS 'User profiles and authentication information';
COMMENT ON TABLE scuffedsnap.sessions IS 'Active user sessions for authentication';
COMMENT ON TABLE scuffedsnap.messages IS 'Chat messages between users';
COMMENT ON TABLE scuffedsnap.friends IS 'Friend relationships and requests';

COMMENT ON FUNCTION scuffedsnap.cleanup_expired_messages() IS 'Deletes expired disappearing messages. Run hourly via cron or manually.';
COMMENT ON FUNCTION scuffedsnap.cleanup_expired_sessions() IS 'Deletes expired user sessions. Run daily via cron or manually.';
COMMENT ON FUNCTION scuffedsnap.get_conversation_messages(UUID, UUID, INT) IS 'Optimized function to get conversation messages with limit. Use instead of direct queries.';

-- Performance optimization: Update statistics
ANALYZE scuffedsnap.profiles;
ANALYZE scuffedsnap.sessions;
ANALYZE scuffedsnap.messages;
ANALYZE scuffedsnap.friends;
