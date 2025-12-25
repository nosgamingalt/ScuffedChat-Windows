-- Add is_admin column to profiles table
-- Run this FIRST in Supabase SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Now grant admin privileges to your account
UPDATE profiles 
SET is_admin = true 
WHERE username = 'NOTnosgaming3125';

-- Verify admin status
SELECT id, username, is_admin, created_at 
FROM profiles 
WHERE is_admin = true;
