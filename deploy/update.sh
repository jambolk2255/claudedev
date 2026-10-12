#!/usr/bin/env bash
# Pull the latest code, rebuild and restart. Usage: sudo bash deploy/update.sh
set -euo pipefail
# shellcheck source=deploy/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_root
[[ -f "$ENV_FILE" ]] || die "deploy/.env not found — run deploy/install.sh first."
cd "$REPO_DIR"
say "Backing up the database first"
bash "$DEPLOY_DIR/backup.sh"
say "Pulling the latest code"
# Run git as the owner of the checkout (git refuses repos owned by another user when run as root).
sudo -u "$(stat -c %U "$REPO_DIR")" git -C "$REPO_DIR" pull --ff-only
say "Rebuilding and restarting"
"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null
wait_healthy
