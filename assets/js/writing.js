import { fetchJSON, formatDate, el, generativeCover, richName } from "./site.js";

const grid = document.getElementById("posts");
const filterBar = document.getElementById("filters");

function card(post, sourceName, tag) {
  const img = el("img", {
    class: "cover", loading: "lazy", alt: "",
    src: post.image || generativeCover(post.title),
  });
  img.addEventListener("error", () => {
    img.src = generativeCover(post.title);
    img.parentElement?.querySelector(".credit")?.remove(); // the credit belonged to the image that failed
  }, { once: true });
  return el("a", { class: "post", href: post.url, target: "_blank", rel: "noopener" },
    el("div", { class: "cover-wrap" }, img,
      post.image_credit ? el("span", { class: "credit" }, post.image_credit) : null),
    el("div", { class: "body" },
      el("span", { class: "pub" }, post.outlet ? post.outlet : richName(sourceName)),
      el("h3", {}, post.title),
      post.subtitle ? el("p", { class: "sub" }, post.subtitle) : null,
      el("span", { class: "meta" }, formatDate(post.date),
        tag ? el("span", { class: "role tag" }, tag) : null,
        post.role ? el("span", { class: "role" }, post.role) : null,
        post.paid ? el("span", { class: "role" }, "Paid") : null)
    )
  );
}

async function main() {
  let data;
  try { data = await fetchJSON("data/posts.json"); }
  catch { data = { posts: [], sources: [] }; }
  const { posts = [], sources = [] } = data;
  const names = Object.fromEntries(sources.map(s => [s.id, s.name]));
  const tags = Object.fromEntries(sources.map(s => [s.id, s.tag]));

  if (!posts.length) {
    grid.replaceWith(el("p", { class: "empty" },
      "No posts yet. In your GitHub repository, open the Actions tab and run “Update Substack posts”, or wait for the daily sync."));
    return;
  }

  let active = new URLSearchParams(location.search).get("from") || "all";
  const options = [{ id: "all", name: "All" }, ...sources.filter(s => posts.some(p => p.source === s.id))];

  function render() {
    filterBar.replaceChildren(...options.map(o => {
      const n = o.id === "all" ? posts.length : posts.filter(p => p.source === o.id).length;
      return el("button", {
        type: "button", "aria-pressed": String(active === o.id),
        onclick: () => {
          active = o.id;
          const url = new URL(location); active === "all" ? url.searchParams.delete("from") : url.searchParams.set("from", active);
          history.replaceState(null, "", url);
          render();
        },
      }, richName(o.name), el("span", { class: "count" }, String(n)));
    }));
    const shown = active === "all" ? posts : posts.filter(p => p.source === active);
    grid.replaceChildren(...shown.map(p => card(p, names[p.source] || "", tags[p.source])));
  }
  render();
}
main();
