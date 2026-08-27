# Md. Rahat Hossain — Portfolio

A static personal portfolio. No build step, no framework, no dependencies to install,
no paid service anywhere in the stack. Open `index.html` and it runs.

```
rahat-portfolio/
├─ index.html              ← page structure + SEO meta
├─ robots.txt
├─ sitemap.xml
└─ assets/
   ├─ favicon.svg          ← RH monogram
   ├─ css/style.css        ← design system + layout
   ├─ img/
   │  ├─ profile.jpg       ← YOUR PHOTO GOES HERE (see below)
   │  └─ og-cover.png      ← social share image
   └─ js/
      ├─ data.js           ← ALL CONTENT LIVES HERE
      └─ main.js           ← rendering + behaviour
```

---

## 1. Add your photo (do this first)

Save your professional headshot as:

```
assets/img/profile.jpg
```

Square, roughly 800×800 px, under ~300 KB. Until that file exists the hero shows the
**RH** monogram instead — the site never breaks, it just falls back.

To use a different filename or format, change `person.photo` in `assets/js/data.js`.

---

## 2. Update content

**Everything you will ever want to change is in `assets/js/data.js`.**
You never touch HTML or CSS to add content.

| To add… | Edit this key in `data.js` |
|---|---|
| A project | `projects` — copy an existing object, change the fields |
| A project category | `projectCategories` — the filter button appears automatically |
| A job | `experience` |
| A degree | `education` |
| A skill or tool | `expertise` → the matching group's `items` |
| Something you're learning | `lab.items` |
| What you're working on now | `now.items` and `now.updated` |
| A social link | `socials` |
| Email / WhatsApp | `contact` |
| Page title / description | `seo` |

### Project fields

```js
{
  title: "Project name",
  category: "Project Monitoring",     // must match one in projectCategories
  badge: "Engineering Tool",          // e.g. Personal Project / Prototype / Professional Work
  art: "grid",                        // grid | network | contour | flow | signal | geometric
  description: "Two or three sentences.",
  role: "What you actually did",
  tech: ["Tool", "Tool"],
  links: {                            // omit any key and its button disappears
    demo: "https://…",
    repo: "https://github.com/…",
    detail: "https://…"
  }
}
```

`art` picks a generated abstract visual drawn in SVG — no stock photos, no image files,
no loading cost.

---

## 3. Run it locally

Just double-click `index.html`. Or, for a proper local server:

```bash
python -m http.server 4321
```

Then open `http://localhost:4321`.

---

## 4. Publish it — free

### GitHub Pages (recommended, free forever)

```bash
git init
git add .
git commit -m "Portfolio"
git branch -M main
git remote add origin https://github.com/rahatce98/portfolio.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: `main` / root → Save**.
Live in a minute at `https://rahatce98.github.io/portfolio/`.

### Alternatives (also free)

- **Netlify** — drag the whole folder onto app.netlify.com/drop.
- **Cloudflare Pages** — connect the repo, no build command, output directory `/`.
- **Vercel** — import the repo, framework preset "Other".

### After publishing

1. In `assets/js/data.js`, set `seo.canonical` to your live URL.
2. In `index.html`, set the same URL in **two places** — `<link id="canonical" href="…">`
   and `<meta property="og:url" content="…">` — and make `og:image` / `twitter:image`
   absolute, e.g. `https://rahatce98.github.io/portfolio/assets/img/og-cover.png`.
   Link preview scrapers (LinkedIn, X, WhatsApp) do **not** run JavaScript, so these
   two tags must be correct in the HTML itself, not only in `data.js`.
3. In `sitemap.xml`, replace `https://your-domain.example/` with the same URL.
4. In `robots.txt`, uncomment the `Sitemap:` line and set the same URL.

The page `<title>`, description and social card text are already hard-coded in
`index.html`, so previews work correctly the moment the site is live.

---

## 5. Extending later

The structure is deliberately open-ended. To add a blog, case studies, calculators,
certifications or a resume download:

- **New section** — add a `<section id="…">` in `index.html`, a `render…()` function in
  `main.js`, and its content array in `data.js`. Follow any existing section as the pattern.
- **New page** — copy `index.html`, keep the same `<head>` and nav, swap the `<main>`.
- **Resume button** — set `person.resume` in `data.js` to a PDF path; the hero button
  appears on its own.
- **Multi-page / i18n** — content is already separated from markup, so a second
  `data-bn.js` and a language switch is a small change.

## 6. Accessibility & performance notes

- Semantic landmarks, single `h1`, ordered heading levels, skip link, visible focus rings.
- Full keyboard operation, including the mobile menu (Escape closes it).
- `prefers-reduced-motion` disables all animation; the layout still stands on its own.
- No images except your photo and the social card — every other visual is CSS/SVG.
- Fonts load from Google Fonts with `display=swap`; remove the `<link>` in `index.html`
  and the system font stack takes over cleanly if you prefer zero external requests.
- The contact form has no backend by design. It composes a message in the visitor's own
  mail client. It never shows a fake "sent" confirmation.
