#!/usr/bin/env python3
"""
Build data/posts.json from the sources listed in data/writing.json.

Runs daily in GitHub Actions (.github/workflows/update-posts.yml), or locally:
    python3 scripts/fetch_substack.py

Three kinds of source:
  * A Substack, all posts:            {"url": "...substack.com"}
  * A Substack, only some posts:      {"url": "...", "only": [{"url": ...}, ...]}
    Posts are matched by URL slug or by title. Any listed post not found in the feed
    is fetched on its own.
  * Plain links on other sites:       {"only": [...]} with no "url"
    Title, summary and image come from each page's preview (Open Graph) tags.

Values typed into an "only" entry (title, date, subtitle, image) are used whenever the
fetched page doesn't provide them, so a card still appears if a site blocks the
request. Posts already in posts.json are kept when a fetch fails, so a bad day never
empties the page. Standard library only.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "data" / "writing.json"
OUT = ROOT / "data" / "posts.json"
UA = "Mozilla/5.0 (compatible; personal-site-post-sync/1.0)"
MAX_POSTS = 1000
NS = {"dc": "http://purl.org/dc/elements/1.1/"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def warn(msg):
    # "::warning::" shows as an annotation on the GitHub Actions run page
    print(f"::warning::{msg}" if "GITHUB_ACTIONS" in os.environ else f"warning: {msg}", file=sys.stderr)


def slug_of(url):
    m = re.search(r"/p/([^/?#]+)", url or "")
    return m.group(1) if m else None


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", "", (t or "").lower())


def clean_url(url):
    """Drop tracking/query junk so URLs compare equal."""
    parts = urllib.parse.urlsplit(url.strip())
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


def iso(date):
    if not date:
        return None
    try:
        return parsedate_to_datetime(date).astimezone(timezone.utc).isoformat()
    except Exception:
        return date


# ---------- Whole-feed fetchers ----------
def api_post(p, base):
    bylines = p.get("publishedBylines") or []
    return {
        "title": (p.get("title") or "").strip(),
        "subtitle": (p.get("subtitle") or p.get("description") or "").strip(),
        "url": clean_url(p.get("canonical_url") or f"{base}/p/{p.get('slug')}"),
        "date": p.get("post_date"),
        "image": p.get("cover_image"),
        "_bylines": [b.get(k) for b in bylines for k in ("name", "handle") if b.get(k)],
        "paid": p.get("audience") == "only_paid",
    }


def from_api(base):
    posts, offset = [], 0
    while offset < MAX_POSTS:
        batch = json.loads(get(f"{base}/api/v1/archive?sort=new&offset={offset}&limit=50"))
        if not isinstance(batch, list) or not batch:
            break
        posts += [api_post(p, base) for p in batch if p.get("type") in (None, "newsletter", "podcast")]
        offset += len(batch)
        if len(batch) < 50:
            break
        time.sleep(1)  # be polite
    return posts


def from_rss(base):
    posts = []
    for item in ET.fromstring(get(f"{base}/feed")).iter("item"):
        enc = item.find("enclosure")
        creator = item.findtext("dc:creator", default="", namespaces=NS)
        posts.append({
            "title": (item.findtext("title") or "").strip(),
            "subtitle": (item.findtext("description") or "").strip(),
            "url": clean_url(item.findtext("link") or ""),
            "date": iso(item.findtext("pubDate")),
            "image": enc.get("url") if enc is not None and (enc.get("type") or "").startswith("image") else None,
            "_bylines": [a.strip() for a in creator.replace(" and ", ",").split(",") if a.strip()],
            "paid": False,
        })
    return posts


# ---------- Single-post fetchers ----------
class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self._in_title, self.title = {}, False, ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and a.get("content") and key not in self.meta:
                self.meta[key.lower()] = a["content"].strip()
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def from_page(url):
    p = MetaParser()
    p.feed(get(url).decode("utf-8", "replace"))
    m = p.meta
    return {
        "title": m.get("og:title") or m.get("twitter:title") or p.title.strip(),
        "subtitle": m.get("og:description") or m.get("description") or "",
        "url": clean_url(url),
        "date": m.get("article:published_time") or m.get("og:article:published_time") or m.get("date"),
        "image": m.get("og:image") or m.get("twitter:image"),
        "paid": False,
    }


def fetch_one(entry, base):
    """One listed post that the feed didn't return."""
    url, slug = entry["url"], slug_of(entry["url"])
    if base and slug:
        try:
            return api_post(json.loads(get(f"{base}/api/v1/posts/{slug}")), base)
        except Exception:
            pass
    try:
        return from_page(url)
    except Exception as e:
        warn(f"could not fetch {url} ({e}); using the title and date typed into writing.json")
        return None


def finish(post, entry, sid):
    """Fill gaps from the config entry and tidy up."""
    post = dict(post or {})
    for k in ("title", "subtitle", "date", "image"):
        if not post.get(k) and entry.get(k):
            post[k] = entry[k]
    post["url"] = clean_url(post.get("url") or entry.get("url"))
    for k in ("outlet", "role"):
        if entry.get(k):
            post[k] = entry[k]
    post.pop("_bylines", None)
    post["source"] = sid
    post.setdefault("paid", False)
    return post


def main():
    cfg = json.loads(CONFIG.read_text())
    old = json.loads(OUT.read_text()) if OUT.exists() else {"posts": []}
    old_by_url = {p["url"]: p for p in old.get("posts", [])}

    all_posts, sources = [], []
    for src in cfg["sources"]:
        sid = src["id"]
        base = (src.get("url") or "").rstrip("/") or None
        sources.append({"id": sid, "name": src["name"], "url": base})
        exclude = {clean_url(u) for u in src.get("exclude") or []}
        only = src.get("only")

        feed = []
        if base:
            for method in (from_api, from_rss):
                try:
                    feed = method(base)
                    print(f"{sid}: {len(feed)} posts in feed via {method.__name__}")
                    break
                except Exception as e:
                    warn(f"{sid}: {method.__name__} failed ({e})")

        kept = {}
        if only is None:
            # Every post in the feed (optionally filtered by byline), plus older saved ones
            wanted = [w.lower() for w in src.get("authors") or []]
            for p in old.get("posts", []):
                if p.get("source") == sid:
                    kept[p["url"]] = p
            for p in feed:
                names = [b.lower() for b in p.get("_bylines", [])]
                if not wanted or any(w in n for w in wanted for n in names):
                    kept[p["url"]] = finish(p, {}, sid)
        else:
            by_slug = {slug_of(p["url"]): p for p in feed}
            by_title = {norm_title(p["title"]): p for p in feed}
            saved = [p for p in old.get("posts", []) if p.get("source") == sid]
            saved_by_title = {norm_title(p.get("title")): p for p in saved}
            for entry in only:
                entry = {**entry, "url": clean_url(entry["url"])}
                hit = by_slug.get(slug_of(entry["url"])) or by_title.get(norm_title(entry.get("title")))
                if not hit:
                    prev = old_by_url.get(entry["url"]) or saved_by_title.get(norm_title(entry.get("title")))
                    # Reuse a complete saved copy instead of re-fetching the page every day
                    hit = prev if prev and prev.get("image") else fetch_one(entry, base)
                post = finish(hit, entry, sid)
                kept[post["url"]] = post
            print(f"{sid}: {len(kept)} listed posts")

        all_posts += [p for u, p in kept.items() if u not in exclude and p.get("title")]

    all_posts.sort(key=lambda p: p.get("date") or "", reverse=True)
    new = {"sources": sources, "posts": all_posts}
    if {k: old.get(k) for k in new} == new:
        print("No changes.")
        return
    new["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    OUT.write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(all_posts)} posts to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
