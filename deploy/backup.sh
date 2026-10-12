#!/usr/bin/env bash
# Database backup (gzipped SQL), keeps 14 days. Usage: sudo bash deploy/backup.sh
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_root
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
FILE="$BACKUP_DIR/stockflow-$(date +%Y%m%d-%H%M%S).sql.gz"
umask 077
"${COMPOSE[@]}" exec -T postgres pg_dump -U stockflow -d stockflow --no-owner --clean --if-exists | gzip >"$FILE"
cp "$FILE" "$BACKUP_DIR/latest.sql.gz"
# The secrets are needed to restore (2FA secrets are encrypted with ENCRYPTION_KEY).
cp "$ENV_FILE" "$BACKUP_DIR/env.backup"
find "$BACKUP_DIR" -name 'stockflow-*.sql.gz' -mtime +14 -delete
ok "Backup saved: $FILE ($(du -h "$FILE" | cut -f1))"
