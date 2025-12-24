# PostgreSQL Connection Setup

## Get Your Connection String from filess.io

1. Go to: https://panel.filess.io/shared/b32e9b09-8f64-4dd7-8be7-0d4a3a11a37b
2. Look for "Connection String" or "Connection Details"
3. Copy the connection string (it should look like this):

```
postgresql://username:password@hostname.filess.io:5432/databasename?sslmode=require
```

## Set the Environment Variable

### For Linux/Mac (Current Session):
```bash
export DATABASE_URL='postgresql://username:password@hostname.filess.io:5432/databasename?sslmode=require'
```

### For Permanent Setup (Linux/Mac):
Add to your `~/.bashrc` or `~/.zshrc`:
```bash
echo 'export DATABASE_URL="postgresql://username:password@hostname.filess.io:5432/databasename?sslmode=require"' >> ~/.bashrc
source ~/.bashrc
```

### For .env File (Alternative):
Create a `.env` file in the project root:
```env
DATABASE_URL=postgresql://username:password@hostname.filess.io:5432/databasename?sslmode=require
```

Then load it before running:
```bash
export $(cat .env | xargs)
./scuffedsnap
```

## Quick Migration Steps

1. **Run the schema in filess.io**:
   - Open SQL editor in filess.io panel
   - Copy/paste contents of `postgres_schema.sql`
   - Execute

2. **Set your DATABASE_URL**:
   ```bash
   export DATABASE_URL='your_connection_string_here'
   ```

3. **Switch to PostgreSQL**:
   ```bash
   ./switch_to_postgres.sh
   ```

4. **Run your app**:
   ```bash
   ./scuffedsnap
   ```

## Verify Connection

Test your connection:
```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

This should show: `PostgreSQL 17.x`

## Common Connection String Formats

### filess.io format:
```
postgresql://user:pass@db.filess.io:5432/dbname?sslmode=require
```

### With special characters in password:
If your password contains special characters, URL-encode them:
- `@` becomes `%40`
- `#` becomes `%23`
- `$` becomes `%24`
- etc.

Example:
```
postgresql://user:p%40ssw0rd@db.filess.io:5432/dbname?sslmode=require
```

## Troubleshooting

### Can't find connection string?
- Check the filess.io dashboard home page
- Look for "Database Details" or "Connection Info"
- It might be under a "Connect" button

### Connection refused?
- Make sure your database is active on filess.io
- Check if there's a firewall/IP whitelist
- Verify the hostname and port (usually 5432)

### SSL error?
Try changing `sslmode=require` to `sslmode=disable` (less secure):
```
postgresql://user:pass@host:5432/db?sslmode=disable
```
