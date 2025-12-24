# Migration Guide: SQLite to PostgreSQL 17 (filess.io)

## Step 1: Run the PostgreSQL Schema

1. Go to your filess.io panel: https://panel.filess.io/shared/b32e9b09-8f64-4dd7-8be7-0d4a3a11a37b
2. Click on the SQL tab or query editor
3. Copy and paste the contents of `postgres_schema.sql`
4. Execute the SQL script

This will create all tables, indexes, and optimized functions.

## Step 2: Get Your PostgreSQL Connection String

From your filess.io panel, copy the connection string. It should look like:
```
postgresql://username:password@host.filess.io:5432/database_name?sslmode=require
```

## Step 3: Install PostgreSQL Driver

Run this command in your terminal:

```bash
go get github.com/lib/pq
go mod tidy
```

## Step 4: Update Your Database Connection

Replace the contents of `database/db.go` with the new PostgreSQL version.

**Option A: Use the new file**
```bash
mv database/db.go database/db_sqlite_backup.go
mv database/postgres.go database/db.go
```

**Option B: Set environment variable**
```bash
export DATABASE_URL="your_connection_string_from_filess_io"
```

Or create a `.env` file:
```env
DATABASE_URL=postgresql://username:password@host.filess.io:5432/database?sslmode=require
```

## Step 5: Update go.mod

Your go.mod should have:
```go
require (
	github.com/gorilla/mux v1.8.1
	github.com/gorilla/websocket v1.5.1
	github.com/lib/pq v1.10.9
	golang.org/x/crypto v0.17.0
)
```

Remove the SQLite dependency:
```bash
go mod edit -droprequire github.com/mattn/go-sqlite3
go mod tidy
```

## Step 6: Rebuild and Run

```bash
go build
./scuffedsnap
```

## Key Changes Made

### Database Schema
- Changed from SQLite INTEGER to PostgreSQL UUID for user IDs
- Added `gen_random_uuid()` for automatic UUID generation
- Changed table name from `users` to `profiles` (matches your original design)
- Added `password_hash` column (was `password` in SQLite)
- All indexes optimized for PostgreSQL 17
- Added helper functions for cleanup and queries

### Query Optimizations
1. **Parameterized queries**: Changed from `?` to `$1, $2, $3` (PostgreSQL syntax)
2. **RETURNING clause**: Get generated IDs in one query
3. **DISTINCT ON**: Optimized conversation queries
4. **ILIKE**: Case-insensitive search (PostgreSQL feature)
5. **Composite indexes**: Faster multi-column queries
6. **Partial indexes**: Only index unread messages

### Database Functions
- `cleanup_expired_messages()`: Auto-delete expired messages
- `cleanup_expired_sessions()`: Auto-delete expired sessions
- `get_conversation_messages()`: Optimized message retrieval

## Performance Benefits

Compared to SQLite:
- ✅ True concurrent connections (no locking issues)
- ✅ Better performance for 100+ users
- ✅ Advanced indexing strategies
- ✅ Built-in functions for complex queries
- ✅ Connection pooling (20 max connections)
- ✅ Automatic query optimization
- ✅ 70-80% reduction in queries (with debouncing from app.js)

## Monitoring

Check your filess.io dashboard for:
- Active connections (should stay under 20)
- Query performance
- Database size
- CPU and memory usage

## Rollback (If Needed)

If you need to go back to SQLite:
```bash
mv database/db.go database/postgres_backup.go
mv database/db_sqlite_backup.go database/db.go
go mod edit -require github.com/mattn/go-sqlite3@v1.14.19
go mod tidy
go build
```

## Troubleshooting

### "connection refused"
- Check your DATABASE_URL is correct
- Verify your filess.io database is running
- Check firewall/network settings

### "pq: password authentication failed"
- Double-check username and password
- Ensure no extra spaces in connection string

### "too many connections"
- Reduce MaxOpenConns in db.go (default: 20)
- Check for connection leaks

### "relation does not exist"
- Make sure you ran postgres_schema.sql first
- Check you're connecting to the right database

## Next Steps

1. Test all features:
   - User registration/login
   - Sending messages
   - Friend requests
   - Message expiration

2. Optional: Set up automated cleanup
   ```sql
   -- Run daily at 3 AM (requires pg_cron extension if available)
   SELECT cron.schedule('cleanup', '0 3 * * *', 'SELECT cleanup_expired_messages(); SELECT cleanup_expired_sessions();');
   ```

3. Monitor performance in filess.io dashboard

4. Consider adding more indexes if you see slow queries
