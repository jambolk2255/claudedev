#!/usr/bin/env bash
# Restore a backup made by backup.sh. Usage: sudo bash deploy/restore.sh /opt/stockflow-backups/stockflow-YYYYMMDD-HHMMSS.sql.gz
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_root
FILE="${1:-}"
[[ -f "$FILE" ]] || die "Usage: sudo bash deploy/restore.sh <backup.sql.gz>"
warn "This replaces ALL current data with $FILE."
read -rp "Type RESTORE to continue: " CONFIRM
[[ "$CONFIRM" == "RESTORE" ]] || die "Cancelled."
cd "$REPO_DIR"
"${COMPOSE[@]}" stop api web
gunzip -c "$FILE" | "${COMPOSE[@]}" exec -T postgres psql -U stockflow -d stockflow -v ON_ERROR_STOP=1 -q >/dev/null
"${COMPOSE[@]}" start api web
wait_healthy
