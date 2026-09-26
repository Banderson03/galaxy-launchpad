# galaxy-launchpad

The landing page for **fornanderson.com**. It's a starfield homepage that links to
everything running on `galaxy`. It's a static site with no build step, served by
nginx in its own Proxmox LXC and published through the existing Cloudflare Tunnel.

```
site/
  index.html        page shell
  styles.css        look & feel
  app.js            rendering, search, status checks, starfield
  services.json     ← the only file you edit to add services
nginx/
  default.conf.template   static serving + /health/* proxies
deploy/
  install.sh        sets up nginx inside the LXC
```

## Using it

- Type to filter, **Enter** opens the top match (Ctrl+Enter opens it in a new tab)
- **/** focuses search from anywhere, **Esc** clears it
- Status dots re-check every 60 seconds

## Deploy on galaxy

### 1. Create the container

In the Proxmox UI: **Create CT** with the **Debian 12** template, unprivileged.
A static page needs almost nothing:

| Setting | Value |
|---|---|
| Cores | 1 |
| Memory | 256 MB (nginx uses ~10 MB) |
| Disk | 2 GB |
| Network | DHCP is fine, but a static IP (or DHCP reservation) keeps the tunnel pointing at the right place |

### 2. Install

In the container's console:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/Banderson03/galaxy-launchpad.git /opt/launchpad
IMMICH_URL=http://<immich-ip>:2283 sh /opt/launchpad/deploy/install.sh
```

Find Immich's IP in Proxmox under its container → **Network**. Then check the status proxy:

```bash
curl -s localhost/health/photos   # should print {"res":"pong"}
```

### 3. Point the domain at it

In the Cloudflare dashboard (Zero Trust → Networks → Tunnels → your tunnel →
Public Hostname → Add):

| Subdomain | Domain | Type | URL |
|---|---|---|---|
| *(blank)* | fornanderson.com | HTTP | `<launchpad-ip>:80` |

Add a second one with subdomain `www` if you want `www.fornanderson.com` too. Use the
container's IP rather than `localhost`, since cloudflared lives in its own container.

### Updating

```bash
cd /opt/launchpad && git pull
```

That's it for site changes: nginx serves `site/` straight from the repo. Only re-run
`install.sh` (same command as above) if `nginx/default.conf.template` changed.

## Adding a service

1. Add an entry to `site/services.json`:

   ```json
   {
     "name": "Jellyfin",
     "description": "Movies & shows",
     "url": "https://media.fornanderson.com",
     "icon": "jellyfin",
     "health": "/health/jellyfin"
   }
   ```

   - `icon` is a slug from [dashboard-icons](https://github.com/homarr-labs/dashboard-icons)
     (`jellyfin`, `home-assistant`, `nextcloud`, `vaultwarden`, …) or a full image URL.
     If it can't load, the card shows the service's first letter.
   - `lan: true` adds a **LAN** badge for things only reachable at home.
   - `soon: true` shows the card greyed out with a **SOON** badge and no link,
     for services that aren't live yet. Delete the line once they are.
   - `health` is optional. Leave it out and the card has no status dot.

2. If you set `health`, add a matching `location = /health/<name>` block in
   `nginx/default.conf.template` (there's a commented example), then `git pull` and
   re-run `install.sh` on the container. Editing only `services.json` needs just a pull.

## Weather

Set in `services.json`, powered by [Open-Meteo](https://open-meteo.com), which is free and needs no API key:

```json
"weather": { "label": "Lincoln, NE", "latitude": 40.81, "longitude": -96.7, "units": "fahrenheit" }
```

Remove the `weather` block to hide the widget. It refreshes every 15 minutes.

## Stars

`"starSpeed": 1` sets how fast the background stars drift. It's a multiplier:
`2` is twice as fast, `0.5` is half, and `0` holds them still. They still twinkle.


`"shootingStarEvery": 15` in `services.json` is the average number of seconds between
shooting stars. Each gap varies by ±50%, and the first one shows up a few seconds after
the page loads. Set it to `0` to turn them off.

## Local preview

```bash
python -m http.server 5173 --directory site
```

Status dots show red locally because the `/health/*` proxies only exist in nginx.

## A note on exposure

This page is public, so anyone can see which services you run. That's fine for
things behind their own login, like Immich. Admin UIs such as Proxmox should never
be published through the tunnel as-is. Keep them LAN-only (like the Proxmox card
here), or put them behind **Cloudflare Access** (Zero Trust → Access → Applications)
so only your email can reach them.
