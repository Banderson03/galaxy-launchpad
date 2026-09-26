# galaxy-launchpad

The landing page for **fornanderson.com**. It's a starfield homepage that links to
everything running on `galaxy`. It's a static site with no build step, served by
nginx in Docker and published through the existing Cloudflare Tunnel.

```
site/
  index.html        page shell
  styles.css        look & feel
  app.js            rendering, search, status checks, starfield
  services.json     ← the only file you edit to add services
nginx/
  default.conf.template   static serving + /health/* proxies
docker-compose.yml
```

## Using it

- Type to filter, **Enter** opens the top match (Ctrl+Enter opens it in a new tab)
- **/** focuses search from anywhere, **Esc** clears it
- Status dots re-check every 60 seconds

## Deploy on galaxy

On whichever Proxmox LXC/VM runs Docker (the one with Immich is simplest):

```bash
git clone <this repo> launchpad && cd launchpad
cp .env.example .env        # set IMMICH_URL if Immich is on a different host
docker compose up -d
curl -s localhost:8080/health/photos   # should print {"res":"pong"}
```

### Point the domain at it

**Tunnel managed in the Cloudflare dashboard** (Zero Trust → Networks → Tunnels →
your tunnel → Public Hostname → Add):

| Subdomain | Domain | Type | URL |
|---|---|---|---|
| *(blank)* | fornanderson.com | HTTP | `localhost:8080` (or `<docker-host-ip>:8080`) |

Add a second one with subdomain `www` if you want `www.fornanderson.com` too.

**Tunnel managed with a local `config.yml`**: add an ingress rule above the catch-all:

```yaml
ingress:
  - hostname: fornanderson.com
    service: http://localhost:8080
  - hostname: photos.fornanderson.com
    service: http://localhost:2283
  - service: http_status:404
```

then `cloudflared tunnel route dns <tunnel> fornanderson.com` and restart cloudflared.

If cloudflared runs in Docker, `localhost` means the cloudflared container itself.
Use the host's LAN IP instead, or put both containers on a shared network and use
`http://launchpad:80`.

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
   `nginx/default.conf.template` (there's a commented example), then
   `docker compose restart`. Editing only `services.json` needs no restart. Just refresh.

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
