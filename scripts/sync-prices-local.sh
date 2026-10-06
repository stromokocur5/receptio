#!/usr/bin/env bash
# Daily price sync from a home computer. api.cenyslovensko.sk doesn't answer GitHub runners or
# Cloudflare Workers (connect timeout / 522), so the scheduled GitHub workflow can't do it.
# Works in a clone of its own, so it never touches a working copy someone is editing.
# Installed as a systemd user timer: scripts/systemd/README.md.
set -euo pipefail

REPO="${RECEPTIO_SYNC_DIR:-$HOME/.local/share/receptio-ceny}"
REMOTE="${RECEPTIO_REMOTE:-git@github.com:stromokocur5/receptio.git}"
FILES=(content/prices-cenyslovensko.yaml content/price-history.csv)

# systemd starts without the login shell, so nvm's node isn't on PATH yet.
if ! command -v pnpm >/dev/null; then
	export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
	# shellcheck source=/dev/null
	source "$NVM_DIR/nvm.sh"
fi

[ -d "$REPO/.git" ] || git clone --quiet "$REMOTE" "$REPO"
cd "$REPO"
# Only this script commits here, so the clone can always be reset to what's on GitHub.
git fetch --quiet origin main
git reset --hard --quiet origin/main

pnpm install --frozen-lockfile --silent
pnpm prices:sync
pnpm test

git add "${FILES[@]}"
if git diff --cached --quiet; then
	echo "Žiadne zmeny."
	exit 0
fi
git commit --quiet -m "Update prices from cenyslovensko.sk ($(date +%F)), synced from home"
# Someone may have pushed meanwhile; prices only touch their own files, so a rebase is safe.
git push --quiet origin HEAD:main || {
	git pull --rebase --quiet origin main
	git push --quiet origin HEAD:main
}
echo "Ceny odoslané."
