#!/bin/bash
# Switch from SQLite to PostgreSQL database

echo "🔄 Switching to PostgreSQL..."

# Backup current db.go
if [ -f "database/db.go" ] && [ ! -f "database/db_sqlite_backup.go" ]; then
    echo "📦 Backing up SQLite db.go..."
    cp database/db.go database/db_sqlite_backup.go
fi

# Copy PostgreSQL version
if [ -f "database/postgres.go" ]; then
    echo "✅ Activating PostgreSQL db.go..."
    cp database/postgres.go database/db.go
    echo "✅ PostgreSQL database activated!"
else
    echo "❌ Error: database/postgres.go not found!"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo ""
    echo "⚠️  WARNING: DATABASE_URL environment variable not set!"
    echo ""
    echo "Please set your PostgreSQL connection string:"
    echo "  export DATABASE_URL='postgresql://username:password@host:port/database?sslmode=require'"
    echo ""
    echo "Or get it from: https://panel.filess.io/shared/b32e9b09-8f64-4dd7-8be7-0d4a3a11a37b"
    echo ""
else
    echo "✅ DATABASE_URL is set"
fi

# Rebuild
echo ""
echo "🔨 Rebuilding application..."
go build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📝 Next steps:"
    echo "  1. Make sure you ran postgres_schema.sql in your filess.io panel"
    echo "  2. Set DATABASE_URL if not already set"
    echo "  3. Run: ./scuffedsnap"
else
    echo "❌ Build failed!"
    exit 1
fi
