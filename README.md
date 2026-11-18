# Personal website

A static site for GitHub Pages with three pages:

- **Home** (`index.html`): photo, bio, contact links, and your 3 latest posts and papers.
- **Public Writing** (`writing.html`): preview cards for your posts from two Substacks, with filter buttons. The posts are pulled automatically every day.
- **Formal Research** (`research.html`): your publications, plus an interactive co-author network. Selecting a person or a topic filters the list.

No build step and nothing to install. Every page is plain HTML, CSS, and JavaScript.

## 1. Put it on GitHub

1. Create a new **public** repository named `<your-username>.github.io`. With that name, the site lives at `https://<your-username>.github.io`. Any other name works too; the site is then at `https://<your-username>.github.io/<repo-name>`.
2. Upload everything in this folder, including the hidden `.github` folder and `.nojekyll` file. From a terminal:
   ```bash
   cd personal-site
   git init && git add . && git commit -m "First version"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-username>.github.io.git
   git push -u origin main
   ```
3. In the repository, go to **Settings > Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, then Save.
The site is live a minute or two later. Your first push also starts the post sync (see the **Actions** tab). It needs permission to save the posts it finds. If that run fails with a "permission denied" or "403" error, go to **Settings > Actions > General**, set "Workflow permissions" to **Read and write permissions**, save, and run it again.

## 2. Make it yours

| What | Where |
|---|---|
| Role, bio, contact links | `index.html` (look for `EDIT:` comments) |
| Photo | Replace `assets/img/photo.jpg` (portrait, about 800×1000 px). |
| CV | `assets/cv.pdf` was converted from your Word file and the fonts were substituted. Replace it with your own PDF export. |
| Public Writing sources | `data/writing.json` (see below) |
| Publications | `data/publications.json` (see below) |
| Colors and fonts | The variables at the top of `assets/css/style.css` |

### Public Writing: `data/writing.json`

There are three sources, and each becomes a filter button (a button only appears once its source has posts):

1. **Imagining ~~Im~~Possible Futures**: every post from your personal Substack, picked up automatically. Write `~~text~~` in a name to strike it through.
2. **Election Rumor Rundown**: only the uwcip.substack.com posts in its `only` list. Many Rundown posts have no byline, so the list is how the site knows which are yours. It currently holds the 15 posts from 2026 (your spreadsheet plus the CV) and 13 from 2024 (your CV).
3. **Other outlets**: articles on other sites (Lawfare, MSNBC, The Conversation, The Fulcrum, CIP and EIP blogs). Each card's label comes from the post's `outlet`.

To add a Rundown post, add a line to the `only` list:

```json
{ "url": "https://uwcip.substack.com/p/some-post", "title": "Post title", "date": "2026-11-20" }
```

Add `"role": "Contributor"` to show a Contributor tag on the card. To add an article on another site, put the same kind of line in the Other outlets list with `"outlet": "Publication name"`.

The cover image and subtitle are fetched for you. The title and date you type in are used whenever the site can't be reached, so the card always appears. To hide a post, put its URL in that source's `exclude` list.

After you save changes to this file, the post sync runs automatically. You can also run it by hand anytime: **Actions** tab > **Update Substack posts** > **Run workflow**. It also runs every day on its own.

**How it works:** browsers aren't allowed to read Substack directly from another website, so a small script (`scripts/fetch_substack.py`) runs in GitHub Actions. It reads each Substack's post archive, matches the posts you listed by link or by title, and saves the results to `data/posts.json`. The pages read that file. If a site can't be reached, the posts already saved stay on the page. Cover images load from the publisher's own servers. Posts without a cover get a generated network drawing instead. The `posts.json` included now was built from your typed-in titles and dates only, so the cards show the generated drawings until the first sync adds the real cover images.

### Publications: `data/publications.json`

```json
{
  "title": "Paper title",
  "authors": ["S. Prochaska", "K. Starbird"],
  "venue": "Proceedings of ACL",
  "year": 2026,
  "url": "https://link-to-the-paper",
  "links": { "PDF": "https://...", "Code": "https://...", "Slides": "https://..." },
  "type": "Papers",
  "note": "Best paper award"
}
```

- `"me"` (S. Prochaska) and `"aliases"` are the ways your name appears in author lists. They're bolded and form the center of the network.
- Write each co-author's name the same way every time (initial and last name). That's how the network knows two papers share a person.
- Put `*` after a name for equal contribution (`"S. Prochaska*"`). A footnote is added automatically.
- `type` becomes the filter buttons (currently Papers, Preprints & white papers, Presentations, matching your CV's sections).
- `status` (e.g. `"Under review"`) lists the paper under that heading instead of its year, and leaves it off the home page.
- `url`, `links`, and `note` are optional. Any link label works.

## Previewing on your own computer

Pages load their data with `fetch`, which doesn't work when you double-click the HTML file. From this folder, run:

```bash
python3 -m http.server
```

and open http://localhost:8000. To pull your real posts locally, run `python3 scripts/fetch_substack.py` first.

## Files

```
index.html, writing.html, research.html   the three pages
assets/css/style.css                       all styling
assets/js/                                 page scripts (+ d3 for the network, in vendor/)
assets/img/photo.jpg                       your photo (placeholder now)
assets/cv.pdf                              your CV
data/writing.json                          what Public Writing shows      ← edit
data/publications.json                     your papers                    ← edit
data/posts.json                            written by the daily sync; don't edit
scripts/fetch_substack.py                  the sync script
.github/workflows/update-posts.yml         runs the sync daily
```
