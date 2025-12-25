-- Automatic cleanup of old messages (2 weeks+)
-- This script deletes messages that are older than 2 weeks to save database space

-- Create a function to clean up old messages
CREATE OR REPLACE FUNCTION cleanup_old_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM messages
    WHERE created_at < NOW() - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job using pg_cron extension (if available)
-- Note: pg_cron needs to be enabled in Supabase dashboard first
-- Go to Database > Extensions and enable pg_cron

-- Schedule the cleanup to run daily at 3 AM UTC
SELECT cron.schedule(
    'cleanup-old-messages',
    '0 3 * * *',
    $$SELECT cleanup_old_messages();$$
);

-- Alternative: Create a trigger-based approach for real-time cleanup
-- This approach deletes old messages whenever new ones are inserted
CREATE OR REPLACE FUNCTION trigger_cleanup_old_messages()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete messages older than 14 days
    DELETE FROM messages
    WHERE created_at < NOW() - INTERVAL '14 days';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs after each insert
DROP TRIGGER IF EXISTS after_message_insert_cleanup ON messages;
CREATE TRIGGER after_message_insert_cleanup
    AFTER INSERT ON messages
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_cleanup_old_messages();

-- Manual cleanup command (run this if you want to clean up immediately)
-- DELETE FROM messages WHERE created_at < NOW() - INTERVAL '14 days';
