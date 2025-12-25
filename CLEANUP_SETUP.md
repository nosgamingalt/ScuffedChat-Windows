# Automatic Message Cleanup Setup

This app now includes automatic cleanup of chat messages older than 2 weeks to save database space.

## Setup Instructions

### Option 1: Using pg_cron (Recommended for Production)

1. **Enable pg_cron extension in Supabase:**
   - Go to your Supabase Dashboard
   - Navigate to `Database` > `Extensions`
   - Search for `pg_cron` and enable it

2. **Run the cleanup script:**
   - Open the SQL Editor in Supabase Dashboard
   - Copy and paste the contents of `cleanup_old_messages.sql`
   - Execute the script

This will schedule automatic cleanup to run every day at 3 AM UTC.

### Option 2: Trigger-Based Cleanup (Automatic)

The `cleanup_old_messages.sql` script also includes a trigger that automatically cleans up old messages whenever a new message is inserted. This is already included in the script and requires no additional setup.

### Manual Cleanup

To manually delete old messages at any time, run this SQL query in your Supabase SQL Editor:

```sql
DELETE FROM messages WHERE created_at < NOW() - INTERVAL '14 days';
```

## How It Works

- Messages older than 14 days (2 weeks) are automatically deleted
- The trigger runs after each message insert to keep the database clean
- If pg_cron is enabled, a scheduled job runs daily at 3 AM UTC as a backup cleanup
- This helps keep your database size manageable and improve query performance

## Customizing the Retention Period

To change how long messages are kept (default is 14 days), edit the INTERVAL in the SQL:

- 7 days: `INTERVAL '7 days'`
- 30 days: `INTERVAL '30 days'`
- 90 days: `INTERVAL '90 days'`

Update both the function and the trigger if you change this value.
