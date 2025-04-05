# Prerender CLI Conxulta

A command-line tool for prerendering JavaScript-based web pages into fully offline snapshots.  
Useful for SEO, archiving, audits, and providing lightweight static fallbacks.

---

## Features

- Render single URLs or sitemap-based multi-page scans
- Generate the following formats:
  - `html`: rendered version of the page
  - `html-embedded`: full HTML with all images, CSS, and icons inlined (offline-ready)
  - `screenshot`: full-page PNG rendered with scroll and optional width
  - `pdf`: export as print-friendly PDF
  - `text`: extract readable body content only
- Auto scroll to activate lazy-loaded or scroll-triggered elements
- Set custom viewport width using `--width` (default: `1024px`)
- Output file names suffixed by width (e.g. `_1024px.png`)
- Supports cookie injection via CLI or config (useful for GDPR banners)
- Metadata and timing saved as `dati.json` and `tempi.csv`
- HTML snapshots include timestamp comment at top
- Help examples available via `-h config`
- Version display via `-v` or `--version`

---

## Example `config.default.json`

```json
{
  "url": "https://www.example.com/sitemap.xml",
  "formats": ["html-embedded", "screenshot", "pdf"],
  "output": "./output",
  "width": 1024,
  "csv": true,
  "cookies": {
    "gdpr": "true"
  }
}
```

---

## CLI Usage

```bash
# Using a config file
prerender -c config.default.json --debug

# Manual configuration from CLI
prerender -u https://example.com -f html,screenshot -w 1440 --cookies '{"gdpr":"true"}'
```

---

## Help

```bash
prerender -h
prerender -h config
prerender -v
```

---

© Francesco Saverio Giudice – Conxulta CLI Tools
