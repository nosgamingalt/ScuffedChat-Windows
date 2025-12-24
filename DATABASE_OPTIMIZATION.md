# Database Optimization Guide

## Optimizations Implemented

### 1. Query Optimizations
- **Limited result sets**: All queries now use `.limit()` to prevent fetching entire tables
  - Messages: Limited to 100 recent messages for conversations, 50 for chat view
  - No limits needed for friends/requests (typically small datasets)

- **Field selection**: Changed from `select('*')` to specific fields
  - Reduces data transfer and processing
  - Only fetches what's actually needed for display

- **Indexed queries**: All queries leverage database indexes
  - Composite indexes for common query patterns
  - Partial indexes for unread messages

### 2. Debouncing & Rate Limiting
- **Conversation reloads**: Debounced with 500ms delay, minimum 2s between actual loads
- **Friend list reloads**: Debounced with 500ms delay, minimum 2s between actual loads
- **Prevents spam**: Realtime subscriptions no longer trigger excessive reloads

### 3. Realtime Subscription Optimization
- **Profile updates**: Only reload affected components, not everything
- **Smart updates**: Update UI directly instead of full reloads when possible
- **Filtered subscriptions**: Only subscribe to relevant changes

### 4. Database Indexes Added
Run these in your Supabase SQL Editor:

```sql
-- Composite index for conversation queries
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver 
ON messages(sender_id, receiver_id, created_at DESC);

-- Partial index for unread messages (more efficient)
CREATE INDEX IF NOT EXISTS idx_messages_read 
ON messages(receiver_id, read_at) WHERE read_at IS NULL;

-- Composite index for friend lookups
CREATE INDEX IF NOT EXISTS idx_friends_user_status 
ON friends(user_id, friend_id, status);

-- Status index for friend queries
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
```

## Performance Improvements

### Before:
- Loading all messages (potentially thousands)
- Fetching all profile fields (*) even when not needed
- Reloading everything on every profile change
- No debouncing on realtime events
- Multiple queries for same data

### After:
- Loading only 50-100 most recent messages
- Fetching only displayed fields (id, username, avatar)
- Smart selective updates based on what changed
- Debounced with rate limiting
- Optimized single queries with proper joins

## Expected Resource Reduction

1. **Database queries**: ~70-80% reduction
2. **Data transfer**: ~60-70% reduction (less fields, fewer rows)
3. **CPU usage**: ~50-60% reduction (less processing)
4. **Memory usage**: ~40-50% reduction (smaller result sets)

## Monitoring

Watch these metrics in Supabase dashboard:
- Active connections (should stay low)
- Query duration (should be faster)
- Rows read (should be significantly lower)
- Database load (should decrease)

## Additional Recommendations

### 1. Message Cleanup (Optional)
Add a scheduled job to delete old messages:
```sql
-- Delete messages older than 90 days
DELETE FROM messages 
WHERE created_at < NOW() - INTERVAL '90 days';
```

### 2. Connection Pooling
If still experiencing issues, enable Supavisor (connection pooler) in Supabase:
- Project Settings → Database → Connection Pooling
- Use transaction mode for most efficient pooling

### 3. Pagination
For users with many conversations, consider implementing:
- Lazy loading for conversation list
- "Load more" button for messages
- Virtual scrolling for large lists

### 4. Caching
Consider implementing:
- Browser localStorage for user profile
- Service worker for offline support
- Cache conversations list client-side

## Troubleshooting

If still seeing high usage:
1. Check slow query log in Supabase
2. Verify indexes are being used (EXPLAIN ANALYZE)
3. Monitor real-time subscription counts
4. Check for connection leaks
