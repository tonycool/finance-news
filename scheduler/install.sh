#!/bin/bash
# Finance Daily — one-time setup script
# Run: bash install.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEND_SCRIPT="$SCRIPT_DIR/send.js"
NODE_PATH="$(which node)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       Finance Daily — Hourly Scheduler       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "✗ Node.js not found. Install it from https://nodejs.org then re-run this script."
  exit 1
fi
echo "✓ Node.js $(node -v) found at $NODE_PATH"

# 2. Install dependencies
echo ""
echo "Installing npm dependencies…"
cd "$SCRIPT_DIR"
npm install --silent
echo "✓ Dependencies installed"

# 3. Check .env
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
  echo ""
  echo "✗ .env file created from template."
  echo "  → Open scheduler/.env and fill in your SMTP credentials + email addresses."
  echo "  → Then re-run this script."
  exit 1
fi
echo "✓ .env file found"

# 4. Test send (generates test-output.html, no email)
echo ""
echo "Running test (no email will be sent)…"
node "$SEND_SCRIPT" --test
echo "✓ Test passed — open scheduler/test-output.html to preview the email"

# 5. Install cron job (runs at the top of every hour)
CRON_CMD="0 * * * * $NODE_PATH $SEND_SCRIPT >> $SCRIPT_DIR/finance-daily.log 2>&1"

# Check if already installed
if crontab -l 2>/dev/null | grep -q "$SEND_SCRIPT"; then
  echo ""
  echo "✓ Cron job already installed — no changes made."
else
  # Append to existing crontab
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo ""
  echo "✓ Cron job installed: runs every hour on the hour"
  echo "  Schedule: $CRON_CMD"
fi

echo ""
echo "┌─────────────────────────────────────────────────┐"
echo "│  All done! The Finance Daily will be emailed    │"
echo "│  to you at the top of every hour.               │"
echo "│                                                  │"
echo "│  Useful commands:                                │"
echo "│    Send now:    node scheduler/send.js           │"
echo "│    View log:    tail -f scheduler/finance-daily.log │"
echo "│    Remove cron: crontab -e  (delete the line)   │"
echo "└─────────────────────────────────────────────────┘"
echo ""
