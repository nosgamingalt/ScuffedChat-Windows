-- Grant admin privileges to specific user
-- Run this in Supabase SQL Editor after the user has registered

-- Make test@gmail.com (username: NOTnosgaming3125) an admin
UPDATE profiles 
SET is_admin = true 
WHERE username = 'NOTnosgaming3125';

-- Verify admin status
SELECT id, username, is_admin, created_at 
FROM profiles 
WHERE is_admin = true;
