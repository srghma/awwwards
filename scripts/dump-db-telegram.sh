#!/usr/bin/env bash
set -euo pipefail

# Find project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -o allexport
  source "$PROJECT_ROOT/.env"
  set +o allexport
fi

# Environment variables with defaults matching flake.nix
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-$(whoami)}"
PGHOST="${PGHOST:-127.0.0.1}"
DB_NAME="${DB_NAME:-awwwards}"
PGDATA="${PGDATA:-$PROJECT_ROOT/.pg}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

DUMP_DIR="$PROJECT_ROOT/dumps"
mkdir -p "$DUMP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$DUMP_DIR/dump_${DB_NAME}_${TIMESTAMP}.sql.gz"

WAS_STOPPED=0

cleanup() {
  if [ "$WAS_STOPPED" -eq 1 ]; then
    echo "🛑 Stopping PostgreSQL (restoring original state)..."
    pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# 1. Check if Postgres is running
echo "🔍 Checking PostgreSQL status..."
if ! pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
  echo "⚠️ PostgreSQL is currently stopped."
  WAS_STOPPED=1
  echo "🚀 Starting PostgreSQL temporarily for backup..."
  
  if [ ! -d "$PGDATA" ]; then
    echo "❌ PGDATA directory does not exist at $PGDATA!"
    exit 1
  fi
  
  pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PGDATA -p $PGPORT" start
  
  # Wait for Postgres to be ready
  READY=0
  for i in {1..10}; do
    if pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1; then
      READY=1
      echo "✨ PostgreSQL is ready!"
      break
    fi
    echo "⏳ Waiting for PostgreSQL... ($i/10)"
    sleep 1
  done
  
  if [ "$READY" -eq 0 ]; then
    echo "❌ Failed to start PostgreSQL. Check $PGDATA/postgres.log"
    exit 1
  fi
else
  echo "🟢 PostgreSQL is already running."
fi

# 2. Perform Database Dump
echo "📦 Creating Postgres dump of database '$DB_NAME'..."
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DB_NAME" | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "✅ Dump created successfully: $DUMP_FILE ($DUMP_SIZE)"

# 3. Send to Telegram if credentials are set
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo ""
  echo "⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in .env"
  echo "   Dump saved locally at: $DUMP_FILE"
  echo "   To send dumps to Telegram, set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env:"
  echo "     TELEGRAM_BOT_TOKEN=\"your_bot_token\""
  echo "     TELEGRAM_CHAT_ID=\"your_chat_id\""
  exit 0
fi

echo "✈️ Sending dump to Telegram chat ($TELEGRAM_CHAT_ID)..."

CAPTION="🐘 Postgres Dump: ${DB_NAME}
📅 ${TIMESTAMP}
📦 Size: ${DUMP_SIZE}"

RESPONSE=$(curl -s -F chat_id="$TELEGRAM_CHAT_ID" \
     -F document=@"$DUMP_FILE" \
     -F caption="$CAPTION" \
     "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument")

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "🎉 Dump successfully sent to Telegram!"
else
  echo "❌ Failed to send dump to Telegram."
  echo "   Telegram API Response: $RESPONSE"
  exit 1
fi
