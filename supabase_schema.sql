-- ScuffedSnap Supabase Database Schema (Optimized)
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/ulwlwrtedihujhpbuzvu/sql)

-- Enable RLS (Row Level Security)
-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(30) UNIQUE NOT NULL,
    avatar VARCHAR(500) DEFAULT '',
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type VARCHAR(10) DEFAULT 'text' CHECK (type IN ('text', 'image')),
    edited BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create friends table
CREATE TABLE IF NOT EXISTS friends (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(10) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_composite ON friends(user_id, friend_id, status);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Messages policies
CREATE POLICY "Users can view their own messages" ON messages
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages" ON messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update messages they received (mark as read)" ON messages
    FOR UPDATE USING (auth.uid() = receiver_id);

CREATE POLICY "Users can update messages they sent (edit content)" ON messages
    FOR UPDATE USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete messages they sent" ON messages
    FOR DELETE USING (auth.uid() = sender_id);

-- Friends policies
CREATE POLICY "Users can view their friendships" ON friends
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can send friend requests" ON friends
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update friend requests sent to them" ON friends
    FOR UPDATE USING (auth.uid() = friend_id);

CREATE POLICY "Users can delete their friendships" ON friends
    FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Enable realtime for messages and friends tables
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE friends;

-- Automatic cleanup function for expired messages
CREATE OR REPLACE FUNCTION delete_expired_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM messages 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup to run every hour using pg_cron (if available)
-- Note: pg_cron needs to be enabled in Supabase dashboard under Database > Extensions
-- SELECT cron.schedule('delete-expired-messages', '0 * * * *', 'SELECT delete_expired_messages()');

-- Alternative: Create a trigger-based approach for immediate cleanup on read
CREATE OR REPLACE FUNCTION cleanup_expired_on_select()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM messages 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW()
    AND (sender_id = auth.uid() OR receiver_id = auth.uid());
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Uncomment below if you want automatic cleanup on queries
-- CREATE TRIGGER trigger_cleanup_expired
-- AFTER SELECT ON messages
-- FOR EACH STATEMENT
-- EXECUTE FUNCTION cleanup_expired_on_select();
