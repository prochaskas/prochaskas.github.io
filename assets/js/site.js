// Shared helpers for every page.

export async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

export function formatDate(iso, opts = { year: "numeric", month: "short", day: "numeric" }) {
  if (!iso) return "";
  if (/^\d{4}$/.test(iso)) return iso; // year only
  // Plain dates ("2026-10-22") are read as local dates so they don't shift a day
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", opts);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return node;
}

// Publication names may use ~~text~~ for a strikethrough, e.g. "Imagining ~~Im~~Possible Futures"
export function richName(text = "") {
  return text.split(/(~~[^~]+~~)/).filter(Boolean).map(part =>
    part.startsWith("~~") ? el("s", {}, part.slice(2, -2)) : document.createTextNode(part));
}
export const plainName = (text = "") => text.replace(/~~/g, "");

// Deterministic little network drawing, used when a post has no cover image.
export function generativeCover(seedText) {
  let h = 2166136261;
  for (const ch of seedText) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const W = 640, H = 360, n = 9 + Math.floor(rand() * 5);
  const pts = Array.from({ length: n }, () => [40 + rand() * (W - 80), 30 + rand() * (H - 60)]);
  let edges = "";
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [Math.hypot(p[0] - q[0], p[1] - q[1]), j]).sort((a, b) => a[0] - b[0]).slice(1, 3);
    near.forEach(([, j]) => { if (j > i || rand() > .5) edges += `<line x1="${p[0]}" y1="${p[1]}" x2="${pts[j][0]}" y2="${pts[j][1]}"/>`; });
  });
  const dots = pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === 0 ? 11 : 4 + rand() * 6}" fill="${i === 0 ? "#C08420" : "#0079A8"}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#E6EBF0"/><g stroke="#AEB9C6" stroke-width="2">${edges}</g>${dots}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

document.querySelectorAll("[data-year]").forEach(n => (n.textContent = new Date().getFullYear()));
