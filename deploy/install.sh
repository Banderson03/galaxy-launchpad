#!/bin/sh
# Installs (or updates) the launchpad's nginx config inside a Debian/Ubuntu LXC.
# Safe to re-run: do so after changing nginx/default.conf.template.
#
#   IMMICH_URL=http://192.168.1.50:2283 sh deploy/install.sh
#
# Site files are served straight from this repo's site/ folder, so a
# `git pull` is all a content update needs. No re-run required.
set -eu

: "${IMMICH_URL:?Set IMMICH_URL to Immich's LAN address, e.g. IMMICH_URL=http://192.168.1.50:2283}"

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
SITE_ROOT="$REPO_DIR/site"
export IMMICH_URL SITE_ROOT

if ! command -v nginx >/dev/null 2>&1 || ! command -v envsubst >/dev/null 2>&1; then
    apt-get update
    apt-get install -y nginx gettext-base
fi

# nginx runs as www-data, which can't read inside /root.
if ! su -s /bin/sh www-data -c "test -r '$SITE_ROOT/index.html'"; then
    echo "nginx (www-data) can't read $SITE_ROOT." >&2
    echo "Clone the repo somewhere readable, e.g. /opt/launchpad, and run this again." >&2
    exit 1
fi

envsubst '${IMMICH_URL} ${SITE_ROOT}' \
    < "$REPO_DIR/nginx/default.conf.template" \
    > /etc/nginx/sites-available/launchpad
ln -sf /etc/nginx/sites-available/launchpad /etc/nginx/sites-enabled/launchpad
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "Launchpad is up: http://$(hostname -I | awk '{print $1}')/"
