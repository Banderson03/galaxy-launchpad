'use strict';

// Icons referenced by slug ("immich") resolve to the community dashboard-icons set.
// A full URL or a path containing "/" is used as-is.
const ICON_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/';
const HEALTH_INTERVAL_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5_000;

const $ = (sel) => document.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ---------- clock & greeting ---------- */

function greetingFor(hour) {
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

function tick() {
  const now = new Date();
  $('#greeting').textContent = greetingFor(now.getHours());
  const clock = $('#clock');
  clock.dateTime = now.toISOString();
  clock.textContent =
    now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) +
    ' · ' +
    now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ---------- rendering ---------- */

function iconFor(service) {
  const box = el('span', 'icon');
  const monogram = () => el('span', 'monogram', service.name.trim().charAt(0).toUpperCase());

  if (!service.icon) {
    box.append(monogram());
    return box;
  }

  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.src = service.icon.includes('/') ? service.icon : `${ICON_CDN}${service.icon}.svg`;
  img.addEventListener('error', () => img.replaceWith(monogram()), { once: true });
  box.append(img);
  return box;
}

function displayUrl(url) {
  try {
    const u = new URL(url, location.href);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

function renderCard(service, groupName) {
  // "soon" services are shown but not linked, so nobody lands on a dead URL.
  const card = el(service.soon ? 'div' : 'a', 'card');
  if (service.soon) {
    card.classList.add('is-soon');
    card.setAttribute('aria-disabled', 'true');
  } else {
    card.href = service.url;
  }
  card.dataset.search = [service.name, service.description, groupName, service.url]
    .filter(Boolean).join(' ').toLowerCase();

  const body = el('span', 'body');
  const name = el('span', 'name', service.name);
  if (service.lan) name.append(el('span', 'badge', 'LAN'));
  if (service.soon) name.append(el('span', 'badge', 'SOON'));
  body.append(name);
  if (service.description) body.append(el('span', 'desc', service.description));
  body.append(el('span', 'url', displayUrl(service.url)));

  card.append(iconFor(service), body);

  if (service.health) {
    const dot = el('span', 'status');
    dot.dataset.state = 'checking';
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', 'Checking status');
    card.append(dot);
    watchHealth(service.health, dot);
  }

  return card;
}

function render(config) {
  const groups = $('#groups');
  groups.replaceChildren();

  for (const group of config.groups ?? []) {
    const section = el('section', 'group');
    const heading = el('h2', null, group.name);
    if (group.note) heading.append(el('small', null, group.note));
    const grid = el('div', 'grid');
    for (const service of group.services ?? []) grid.append(renderCard(service, group.name));
    section.append(heading, grid);
    groups.append(section);
  }
}

/* ---------- health checks ---------- */

// Health paths are same-origin endpoints proxied by nginx to each service on the LAN,
// so the check reflects the real service rather than Cloudflare's edge.
async function checkHealth(path, dot) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  let up = false;
  try {
    const res = await fetch(path, { cache: 'no-store', signal: ctrl.signal });
    up = res.ok;
  } catch {
    up = false;
  } finally {
    clearTimeout(timer);
  }
  dot.dataset.state = up ? 'up' : 'down';
  dot.setAttribute('aria-label', up ? 'Online' : 'Offline');
  dot.title = up ? 'Online' : 'Not responding';
}

function watchHealth(path, dot) {
  checkHealth(path, dot);
  setInterval(() => { if (!document.hidden) checkHealth(path, dot); }, HEALTH_INTERVAL_MS);
}

/* ---------- weather ---------- */

// Open-Meteo: free, keyless, CORS-enabled. https://open-meteo.com
const WEATHER_REFRESH_MS = 15 * 60_000;

const CLOUD = 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z';
const CLOUD_HIGH = 'M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 8.1 3.5 3.5 0 0 0 7 15z';
const WX_ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  partly: '<path d="M8 3v1.5M3 8h1.5M4.5 4.5l1 1M11.5 4.5l-1 1"/><path d="M5.6 10.4A3 3 0 1 1 10.9 7"/><path d="M9 20h8a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.2 13.9 3 3 0 0 0 9 20z"/>',
  cloud: `<path d="${CLOUD}"/>`,
  fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
  rain: `<path d="${CLOUD_HIGH}"/><path d="M8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3"/>`,
  snow: `<path d="${CLOUD_HIGH}"/><path d="M8 19h.01M12 21h.01M16 19h.01M10 22h.01M14 22h.01"/>`,
  storm: `<path d="${CLOUD_HIGH}"/><path d="M12.5 15 10 19h4l-2.5 4"/>`,
};

// WMO weather interpretation codes → [label, icon kind]
function describeWeather(code, isDay = true) {
  const clear = isDay ? 'sun' : 'moon';
  if (code === 0) return ['Clear', clear];
  if (code === 1) return ['Mostly clear', clear];
  if (code === 2) return ['Partly cloudy', isDay ? 'partly' : 'cloud'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code === 45 || code === 48) return ['Foggy', 'fog'];
  if (code >= 51 && code <= 57) return ['Drizzle', 'rain'];
  if (code >= 61 && code <= 67) return [code >= 65 ? 'Heavy rain' : 'Rain', 'rain'];
  if (code >= 71 && code <= 77) return ['Snow', 'snow'];
  if (code >= 80 && code <= 82) return ['Showers', 'rain'];
  if (code === 85 || code === 86) return ['Snow showers', 'snow'];
  if (code >= 95) return ['Thunderstorms', 'storm'];
  return ['—', 'cloud'];
}

function wxIcon(kind) {
  const box = el('span', 'wx-icon');
  box.dataset.kind = kind;
  box.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${WX_ICONS[kind]}</svg>`;
  return box;
}

async function fetchForecast(cfg) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: cfg.latitude,
    longitude: cfg.longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: cfg.units === 'celsius' ? 'celsius' : 'fahrenheit',
    timezone: 'auto',
    forecast_days: '4',
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  return res.json();
}

function renderWeather(box, placeLabel, data) {
  const deg = (n) => `${Math.round(n)}°`;
  const { current, daily } = data;
  const [label, kind] = describeWeather(current.weather_code, current.is_day === 1);

  const summary = el('div', 'wx-summary');
  summary.append(
    el('div', 'wx-cond', label),
    el('div', 'wx-hilo', `H ${deg(daily.temperature_2m_max[0])} · L ${deg(daily.temperature_2m_min[0])}`),
  );
  const rainChance = daily.precipitation_probability_max[0];
  if (rainChance >= 20) summary.append(el('div', 'wx-rain', `${rainChance}% chance of rain`));

  const now = el('div', 'wx-now');
  now.append(wxIcon(kind), el('span', 'wx-temp', deg(current.temperature_2m)), summary);
  now.title = `Feels like ${deg(current.apparent_temperature)}`;

  const days = el('div', 'wx-days');
  for (let i = 1; i < daily.time.length; i++) {
    const day = el('div', 'wx-day');
    // Noon avoids the date rolling back a day when parsed in a western timezone.
    const name = new Date(`${daily.time[i]}T12:00`).toLocaleDateString(undefined, { weekday: 'short' });
    const temps = el('span');
    temps.append(el('b', null, deg(daily.temperature_2m_max[i])), ` ${deg(daily.temperature_2m_min[i])}`);
    day.append(el('span', null, name), wxIcon(describeWeather(daily.weather_code[i])[1]), temps);
    days.append(day);
  }

  box.replaceChildren(now, days, el('div', 'wx-place', placeLabel));
  box.hidden = false;
}

// The widget stays hidden until the first successful fetch.
function setupWeather(cfg) {
  if (cfg?.latitude == null || cfg?.longitude == null) return;
  const box = $('#weather');
  const refresh = async () => {
    try {
      renderWeather(box, cfg.label ?? '', await fetchForecast(cfg));
    } catch (err) {
      console.warn('Weather unavailable:', err);
    }
  };
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, WEATHER_REFRESH_MS);
}

/* ---------- search ---------- */

function setupSearch() {
  const input = $('#search');
  const empty = $('#empty');

  const visibleCards = () => [...document.querySelectorAll('.card:not([hidden])')];
  // Only real links can be highlighted/opened; "soon" cards still show in results.
  const launchable = () => [...document.querySelectorAll('a.card:not([hidden])')];

  function filter() {
    const q = input.value.trim().toLowerCase();
    for (const card of document.querySelectorAll('.card')) {
      card.hidden = q !== '' && !card.dataset.search.includes(q);
      card.classList.remove('is-first');
    }
    for (const group of document.querySelectorAll('.group')) {
      group.hidden = !group.querySelector('.card:not([hidden])');
    }
    const visible = visibleCards();
    empty.hidden = visible.length > 0;
    const first = launchable()[0];
    if (q && first) first.classList.add('is-first');
  }

  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = launchable()[0];
      if (first) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) window.open(first.href, '_blank', 'noopener');
        else location.href = first.href;
      }
    } else if (e.key === 'Escape') {
      input.value = '';
      filter();
      input.blur();
    } else if (e.key === 'ArrowDown') {
      const first = launchable()[0];
      if (first) { e.preventDefault(); first.focus(); }
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLElement &&
      (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') {
      e.preventDefault();
      input.focus();
    }
  });
}

/* ---------- starfield ---------- */

function starfield(canvas) {
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const palette = ['255,255,255', '255,255,255', '200,215,255', '190,180,255', '255,225,205'];

  let w = 0, h = 0, stars = [], raf = 0;
  let parallaxX = 0, parallaxY = 0, targetX = 0, targetY = 0;
  // Average seconds between shooting stars (set via services.json; 0 turns them off).
  // Each gap is randomized ±50% so they don't feel metronomic.
  let meteorEveryMs = 15_000;
  // Drift speed multiplier (services.json "starSpeed"; 0 = still). Distance is
  // accumulated per frame so changing the speed never makes stars jump.
  let starSpeed = 1, travelled = 0, lastT = 0;
  const meteorGap = () => meteorEveryMs * (0.5 + Math.random());
  let meteor = null, nextMeteorAt = 4000 + Math.random() * 6000;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(700, Math.round((w * h) / 3200));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() ** 2.2 * 0.9 + 0.1, // most stars far away, a few close
      phase: Math.random() * Math.PI * 2,
      color: palette[(Math.random() * palette.length) | 0],
    }));
    if (reduceMotion.matches) draw(0);
  }

  function drawMeteor(t) {
    if (!meteor && meteorEveryMs > 0 && t > nextMeteorAt) {
      meteor = {
        x: Math.random() * w * 0.7 + w * 0.2,
        y: Math.random() * h * 0.35,
        start: t,
        duration: 900 + Math.random() * 500,
        len: 140 + Math.random() * 120,
      };
    }
    if (!meteor) return;
    const p = (t - meteor.start) / meteor.duration;
    if (p >= 1) {
      meteor = null;
      nextMeteorAt = t + meteorGap();
      return;
    }
    const travel = p * 420;
    const hx = meteor.x - travel;
    const hy = meteor.y + travel * 0.45;
    const tx = hx + meteor.len;
    const ty = hy - meteor.len * 0.45;
    const alpha = Math.sin(p * Math.PI) * 0.85;
    const grad = ctx.createLinearGradient(hx, hy, tx, ty);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(160,190,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  function draw(t) {
    // Clamp the step so returning to a backgrounded tab doesn't lurch the sky.
    if (lastT) travelled += Math.min(t - lastT, 100) * 0.0045 * starSpeed;
    lastT = t;
    ctx.clearRect(0, 0, w, h);
    const still = reduceMotion.matches;
    parallaxX += (targetX - parallaxX) * 0.04;
    parallaxY += (targetY - parallaxY) * 0.04;

    for (const s of stars) {
      const drift = still ? 0 : travelled * s.z;
      let x = (s.x + drift + parallaxX * s.z * 24) % w;
      if (x < 0) x += w;
      const y = s.y + parallaxY * s.z * 24;
      const twinkle = still ? 1 : 0.7 + 0.3 * Math.sin(t * 0.0012 + s.phase);
      const alpha = (0.25 + 0.75 * s.z) * twinkle;
      const r = 0.25 + s.z * 1.25;
      ctx.fillStyle = `rgba(${s.color},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!still) drawMeteor(t);
  }

  function frame(t) {
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduceMotion.matches) draw(0);
    else raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    targetX = (e.clientX / w - 0.5) * -1;
    targetY = (e.clientY / h - 0.5) * -1;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else start();
  });
  reduceMotion.addEventListener('change', start);

  resize();
  start();

  return {
    setStarSpeed(multiplier) {
      starSpeed = Math.max(0, Number(multiplier) || 0);
    },
    setShootingStarEvery(seconds) {
      meteorEveryMs = Math.max(0, Number(seconds) || 0) * 1000;
    },
  };
}

/* ---------- boot ---------- */

// "fornanderson.com" → name + separately styled ".com"
function setTitle(title) {
  document.title = title;
  const dot = title.lastIndexOf('.');
  const h1 = $('#title');
  if (dot <= 0) {
    h1.textContent = title;
    return;
  }
  h1.replaceChildren(el('span', 'domain', title.slice(0, dot)), el('span', 'tld', title.slice(dot)));
}

async function main() {
  const sky = starfield($('#stars'));
  tick();
  setInterval(tick, 10_000);
  setupSearch();

  try {
    const res = await fetch('services.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`services.json returned ${res.status}`);
    const config = await res.json();

    if (config.title) setTitle(config.title);
    if (config.tagline) {
      $('#tagline').textContent = config.tagline;
      $('#tagline').hidden = false;
    }
    setupWeather(config.weather);
    if (config.starSpeed != null) sky.setStarSpeed(config.starSpeed);
    if (config.shootingStarEvery != null) sky.setShootingStarEvery(config.shootingStarEvery);
    if (config.host) {
      $('#host').textContent = config.host;
      $('#footer-host').textContent = config.host;
    }
    render(config);
  } catch (err) {
    const box = el('p', 'error', `Couldn't load services.json: ${err.message}`);
    $('#groups').replaceChildren(box);
  }
}

main();
