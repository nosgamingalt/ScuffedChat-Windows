# Database Update Instructions

To enable message editing functionality and username management, you need to update your database.

## Run These SQL Commands in Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/piygecuivbkawnkpdxnk/sql

Run the following commands:

```sql
-- Add edited column to track if message was edited
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false;

-- Add updated_at column to track when message was last edited
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Create policy to allow users to update their own messages
CREATE POLICY "Users can update messages they sent (edit content)" ON messages
    FOR UPDATE USING (auth.uid() = sender_id);

-- Enable realtime for profiles table to sync username changes
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

## Features Added

### Message Editing & Deletion

**Web (Desktop)**
- Right-click on your sent messages to see **Edit** and **Delete** options
- Edit option opens a prompt where you can modify the message text
- Delete option removes the message for everyone
- Edited messages show "(edited)" indicator

**Mobile**
- Long-press (hold for 500ms) on your sent messages to see options menu
- Same Edit and Delete functionality as desktop
- Touch-friendly context menu positioning

**Real-time Sync**
- Edited messages are updated in real-time for all participants
- Deleted messages are removed in real-time for all participants
- Message preview in conversation list updates automatically
- "(edited)" indicator appears for both sender and receiver

### Username Management

**Google OAuth Setup**
- When logging in with Google for the first time, you'll be prompted to choose a username
- Username must be 3-20 characters (letters, numbers, underscores only)
- Username must be unique

**Profile Editing**
- Click on your profile (avatar and username) in the sidebar to edit
- Change your username anytime
- Username changes are synced in real-time to all users
- Other users will see your new username in:
  - Conversations list
  - Friends list
  - Friend requests
  - Chat headers
  - Messages

**Real-time Username Sync**
- When you change your username, all users see the update immediately
- No need to refresh the page
- Updates appear in all UI components automatically

## Notes
- You can only edit/delete messages you sent (not received messages)
- Image messages can only be deleted, not edited
- Editing requires text input (uses browser prompt)
- Usernames must be unique across all users
- Profile updates trigger realtime sync for all connected users

