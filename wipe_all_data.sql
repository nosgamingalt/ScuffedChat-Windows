-- WIPE ALL DATA - Use with caution!
-- Run this in Supabase SQL Editor to completely reset the database

-- Delete all messages first (has foreign keys)
DELETE FROM messages;

-- Delete all friend relationships
DELETE FROM friends;

-- Delete all profiles (this will cascade from auth.users)
DELETE FROM profiles;

-- Delete all users from auth (this is the important one)
-- Note: You need to use Supabase's auth admin functions
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT id FROM auth.users
    LOOP
        -- Delete user (this will cascade to profiles due to ON DELETE CASCADE)
        DELETE FROM auth.users WHERE id = user_record.id;
    END LOOP;
END $$;

-- Verify everything is clean
SELECT 'auth.users count: ' || COUNT(*)::text FROM auth.users;
SELECT 'profiles count: ' || COUNT(*)::text FROM profiles;
SELECT 'messages count: ' || COUNT(*)::text FROM messages;
SELECT 'friends count: ' || COUNT(*)::text FROM friends;
