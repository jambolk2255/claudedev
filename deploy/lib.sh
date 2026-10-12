# shellcheck shell=bash disable=SC2034
# Shared helpers for the deploy scripts (sourced, not run directly).
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"
ENV_FILE="$DEPLOY_DIR/.env"
BACKUP_DIR="/opt/stockflow-backups"
COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" --env-file "$ENV_FILE")

say() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() {
  printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2
  exit 1
}

require_root() { [[ $EUID -eq 0 ]] || die "Run with sudo: sudo bash $0"; }

# Reads one value from deploy/.env without executing the file.
env_get() {
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]$//"
}

wait_healthy() {
  local url
  url="https://$(env_get DOMAIN)/api/v1/health"
  say "Waiting for $url"
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      ok "StockFlow is up"
      return 0
    fi
    sleep 5
  done
  warn "Not reachable over HTTPS yet. Check: ${COMPOSE[*]} logs --tail 50 caddy api"
  return 1
}
