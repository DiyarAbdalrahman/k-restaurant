#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/var/www/k-restaurant"
FRONTEND_DIR="$ROOT_DIR/frontend"

cd "$FRONTEND_DIR"

# Clean build to avoid stale or partial artifacts
rm -rf .next
npm run build

# Only restart if build succeeded
pm2 restart k-restaurant-frontend
