import { fetchJSON, el } from "./site.js";

const ME = "__me__";
const state = { person: null, type: null };
let data, pubs, isMe, graph;

const graphBox = document.getElementById("coauthor-graph");
const listBox = document.getElementById("pub-list");
const noteBox = document.getElementById("filter-note");
const typeBox = document.getElementById("topics");
const bare = name => name.replace(/\*+$/, "").trim();

const keyOf = name => (isMe(name) ? ME : bare(name));

// ---------- Data ----------
function buildNetwork() {
  const nodes = new Map([[ME, { id: ME, name: data.me, papers: [] }]]);
  const links = new Map();
  pubs.forEach((p, i) => {
    const keys = [...new Set(p.authors.map(keyOf))];
    keys.forEach(k => {
      if (!nodes.has(k)) nodes.set(k, { id: k, name: k, papers: [] });
      nodes.get(k).papers.push(i);
    });
    for (let a = 0; a < keys.length; a++)
      for (let b = a + 1; b < keys.length; b++) {
        const id = [keys[a], keys[b]].sort().join("|");
        if (!links.has(id)) links.set(id, { source: keys[a], target: keys[b], papers: [] });
        links.get(id).papers.push(i);
      }
  });
  return { nodes: [...nodes.values()], links: [...links.values()] };
}

function visiblePubs() {
  return pubs.map((p, i) => i).filter(i => {
    const p = pubs[i];
    if (state.type && p.type !== state.type) return false;
    if (state.person && !p.authors.some(a => keyOf(a) === state.person)) return false;
    return true;
  });
}

// ---------- Graph ----------
function drawGraph() {
  const net = buildNetwork();
  const W = Math.max(280, graphBox.clientWidth), H = Math.round(W * 0.86);
  const cx = W / 2, cy = H / 2, R = W / 2 - 62;
  const r = d => (d.id === ME ? 12 : 3.5 + 2.6 * Math.sqrt(d.papers.length));
  // Rings: the more work shared, the closer to the center
  const rings = [{ min: 3, f: 0.34, label: "3+" }, { min: 2, f: 0.63, label: "2" }, { min: 1, f: 0.93, label: "1" }];
  const ringOf = d => rings.find(g => d.papers.length >= g.min);

  // Deterministic radial layout (same picture on every load):
  // each paper gets a slice of the circle sized by how many one-time co-authors it has;
  // one-time co-authors sit in their paper's slice on the outer ring, and repeat
  // collaborators sit at the average angle of their shared papers, on an inner ring.
  const meNode = net.nodes.find(n => n.id === ME);
  meNode.x = cx; meNode.y = cy;
  const others = net.nodes.filter(n => n.id !== ME);
  const outerCount = pubs.map((p, i) => others.filter(d => d.papers.length === 1 && d.papers[0] === i).length);
  const weights = outerCount.map(n => n + 0.6);
  const total = d3.sum(weights);
  let acc = 0;
  const arc = weights.map(w => { const a0 = (acc / total) * 2 * Math.PI; acc += w; return [a0, (acc / total) * 2 * Math.PI]; });
  const mid = i => (arc[i][0] + arc[i][1]) / 2;

  const placed = new Map(); // node -> angle
  pubs.forEach((p, i) => {
    const solo = others.filter(d => d.papers.length === 1 && d.papers[0] === i);
    solo.forEach((d, k) => placed.set(d, arc[i][0] + ((k + 0.8) / (solo.length + 0.6)) * (arc[i][1] - arc[i][0])));
  });
  rings.slice(0, 2).forEach(g => {
    const inRing = others.filter(d => ringOf(d) === g);
    inRing.forEach(d => {
      const sx = d3.sum(d.papers, i => Math.cos(mid(i))), sy = d3.sum(d.papers, i => Math.sin(mid(i)));
      placed.set(d, Math.atan2(sy, sx));
    });
    // nudge apart so labels have room
    const minSep = 58 / (g.f * R);
    const list = inRing.sort((a, b) => placed.get(a) - placed.get(b));
    for (let pass = 0; pass < 60 && list.length > 1; pass++)
      list.forEach((d, k) => {
        const e = list[(k + 1) % list.length];
        let gap = placed.get(e) - placed.get(d);
        if (k === list.length - 1) gap += 2 * Math.PI;
        if (gap < minSep) { const push = (minSep - gap) / 2; placed.set(d, placed.get(d) - push); placed.set(e, placed.get(e) + push); }
      });
  });
  others.forEach(d => {
    const t = placed.get(d) - Math.PI / 2, rr = ringOf(d).f * R;
    d.x = cx + rr * Math.cos(t); d.y = cy + rr * Math.sin(t);
  });
  const byId = new Map(net.nodes.map(n => [n.id, n]));
  net.links.forEach(l => { l.source = byId.get(l.source); l.target = byId.get(l.target); });

  graphBox.replaceChildren();
  const svg = d3.select(graphBox).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr("aria-label", `Co-author network: ${net.nodes.length - 1} collaborators across ${pubs.length} papers`);
  const tip = d3.select(graphBox).append("div").attr("class", "tooltip").attr("role", "presentation");

  svg.append("g").selectAll("circle").data(rings).join("circle")
    .attr("class", "ring").attr("cx", cx).attr("cy", cy).attr("r", g => g.f * R);
  const edges = svg.append("g").selectAll("line").data(net.links).join("line")
    .attr("class", l => "edge" + (l.source.id === ME || l.target.id === ME ? " spoke" : ""))
    .attr("stroke-width", l => 1 + Math.min(l.papers.length, 4) * 0.6)
    .attr("x1", l => l.source.x).attr("y1", l => l.source.y)
    .attr("x2", l => l.target.x).attr("y2", l => l.target.y);

  const nodes = svg.append("g").selectAll("g").data(net.nodes).join("g")
    .attr("class", d => "node" + (d.id === ME ? " me" : ""))
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", d => d.id === ME ? `${data.me}: show all papers` : `${d.name}, ${d.papers.length} works together`);

  nodes.append("circle").attr("r", d => r(d) + 8).attr("fill", "transparent"); // larger hit target
  nodes.append("circle").attr("class", "dot").attr("r", r);
  const labels = nodes.append("text")
    .attr("x", d => (d.id !== ME && d.x < cx ? -(r(d) + 4) : r(d) + 4))
    .attr("text-anchor", d => (d.id !== ME && d.x < cx ? "end" : "start"))
    .attr("dy", "0.35em")
    .text(d => (d.id === ME ? "Me" : d.name));

  const years = d => d3.extent(d.papers, i => pubs[i].year);
  const show = (event, d) => {
    if (d.id === ME) return;
    const [a, b] = years(d);
    tip.html(`<strong>${d.name}</strong>${d.papers.length} works together, ${a === b ? a : `${a} to ${b}`}`)
      .style("left", `${(d.x / W) * graphBox.clientWidth}px`)
      .style("top", `${(d.y / H) * graphBox.clientHeight - r(d)}px`)
      .classed("show", true);
  };
  const hide = () => tip.classed("show", false);
  const pick = (e, d) => {
    state.person = d.id === ME || state.person === d.id ? null : d.id;
    update();
  };
  nodes.on("mouseenter", show).on("mouseleave", hide).on("focus", show).on("blur", hide)
    .on("click", pick)
    .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e, d); } });

  graph = { nodes, edges, labels, net, labelMin: W < 400 ? 3 : 2 };
  paintGraph();
}

function paintGraph() {
  if (!graph) return;
  const live = new Set(visiblePubs());
  const filtered = state.person || state.type;
  const inLive = d => d.papers.some(i => live.has(i));
  graph.nodes
    .classed("on", d => d.id === state.person)
    .classed("dim", d => filtered && d.id !== ME && !inLive(d));
  graph.edges
    .classed("on", l => !!state.person && (l.source.id === state.person || l.target.id === state.person) && l.papers.some(i => live.has(i)))
    .classed("dim", l => filtered && !l.papers.some(i => live.has(i)));
  // Label the frequent collaborators always; everyone else when relevant.
  graph.labels.attr("display", d =>
    d.id === ME || d.papers.length >= graph.labelMin || d.id === state.person || (filtered && inLive(d)) ? null : "none");
}

// ---------- List ----------
function authorLine(authors) {
  const out = [];
  authors.forEach((a, i) => {
    if (i) out.push(i === authors.length - 1 ? (authors.length > 2 ? ", and " : " and ") : ", ");
    const star = /\*$/.test(a) ? el("sup", { title: "Equal contribution" }, "*") : null;
    out.push(isMe(a) ? el("span", { class: "me" }, bare(a)) : bare(a), star);
  });
  return el("p", { class: "authors" }, out);
}

function renderList() {
  const idx = visiblePubs();
  // Group by status ("Under review") first, then by year, newest first
  const rank = k => (typeof k === "number" ? k : 1e6);
  const byYear = d3.groups(idx.map(i => pubs[i]), p => p.status || p.year).sort((a, b) => rank(b[0]) - rank(a[0]));
  listBox.replaceChildren(...byYear.map(([year, items]) =>
    el("section", { class: "year-group" },
      el("h2", {}, String(year)),
      el("ul", { class: "pubs" }, items.map(p =>
        el("li", { class: "pub-item" },
          el("h3", {}, p.url ? el("a", { href: p.url }, p.title) : p.title),
          authorLine(p.authors),
          el("p", { class: "venue" }, p.venue),
          p.note ? el("p", { class: "award" }, p.note) : null,
          Object.keys(p.links || {}).length
            ? el("div", { class: "links" }, Object.entries(p.links).map(([label, href]) => el("a", { href }, label)))
            : null
        )))
    )));

  const parts = [];
  if (state.person) parts.push(`with ${state.person}`);
  if (state.type) parts.unshift(`in ${state.type}`);
  noteBox.replaceChildren(
    parts.length
      ? el("span", {}, `Showing ${idx.length} of ${pubs.length} ${parts.join(" ")}. `,
          el("button", { type: "button", onclick: () => { state.person = state.type = null; update(); } }, "Show everything"))
      : `${pubs.length} papers, preprints, and talks, newest first.`
  );
  if (idx.some(i => pubs[i].authors.some(a => /\*$/.test(a))))
    listBox.append(el("p", { class: "meta footnote" }, "* Equal contribution"));
}

function renderTypes() {
  const counts = d3.rollups(pubs.filter(p => p.type), v => v.length, p => p.type).sort((a, b) => b[1] - a[1]);
  typeBox.replaceChildren(...counts.map(([t, n]) =>
    el("button", {
      type: "button", class: "chip", "aria-pressed": String(state.type === t),
      onclick: () => { state.type = state.type === t ? null : t; update(); },
    }, `${t} (${n})`)));
}

function update() { renderTypes(); renderList(); paintGraph(); }

// ---------- Init ----------
async function main() {
  data = await fetchJSON("data/publications.json");
  const mine = new Set([data.me, ...(data.aliases || [])].map(s => s.toLowerCase()));
  isMe = name => mine.has(bare(name).toLowerCase());
  pubs = data.publications;
  update();
  drawGraph();
  let w = graphBox.clientWidth;
  new ResizeObserver(() => { if (Math.abs(graphBox.clientWidth - w) > 30) { w = graphBox.clientWidth; drawGraph(); } }).observe(graphBox);
}
main().catch(err => { listBox.textContent = err.message; });
