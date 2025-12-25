# Database Update Instructions

To enable message editing functionality, you need to add two new columns to your `messages` table in Supabase.

## Run These SQL Commands in Supabase SQL Editor

Go to: https://supabase.com/dashboard/project/ulwlwrtedihujhpbuzvu/sql

Run the following commands:

```sql
-- Add edited column to track if message was edited
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false;

-- Add updated_at column to track when message was last edited
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Create policy to allow users to update their own messages
CREATE POLICY "Users can update messages they sent (edit content)" ON messages
    FOR UPDATE USING (auth.uid() = sender_id);
```

## Features Added

### Web (Desktop)
- Right-click on your sent messages to see **Edit** and **Delete** options
- Edit option opens a prompt where you can modify the message text
- Delete option removes the message for everyone
- Edited messages show "(edited)" indicator

### Mobile
- Long-press (hold for 500ms) on your sent messages to see options menu
- Same Edit and Delete functionality as desktop
- Touch-friendly context menu positioning

### Real-time Sync
- Edited messages are updated in real-time for all participants
- Deleted messages are removed in real-time for all participants
- Message preview in conversation list updates automatically
- "(edited)" indicator appears for both sender and receiver

## Notes
- You can only edit/delete messages you sent (not received messages)
- Image messages can only be deleted, not edited
- Editing requires text input (uses browser prompt)
