# DerbysBus Site Map Explorer

Interactive viewer for the archived **derbysbus.info** estate. The project ingests scraped timetable/map data, renders Mermaid.js diagrams on demand, and exposes the inventories required for migration planning.

## Features

- 📁 Manifest-driven gallery of every Mermaid diagram under `diagrams/`
- 🔎 Search + pill filters to zero in on pages, sections, or sitemap diagrams
- 🧭 Pan/zoom controls powered by `svg-pan-zoom` with copy/share/download actions
- 🧱 Structured outline panel that derives hierarchical summaries from each diagram
- 📥 CSV/JSON exports (`exports/` + `data/`) kept in sync via helper scripts
- 🧾 Instruction modal that documents how to refresh or reproduce the analysis pipeline
- ♿️ Keyboard-friendly sidebar (arrow/tab navigation, visible focus rings)

## Repository structure

```
Siteinfo/
├── assets/                 # Front-end JS & CSS
├── data/                   # Generated manifest + structured JSON
├── diagrams/               # Mermaid files produced by the scraper
├── exports/                # CSV inventories (pages + assets)
├── scripts/                # Node helpers to rebuild manifests/exports
├── index.html              # Single-page viewer
├── README.md
└── LICENSE
```

## Prerequisites

- [Node.js 18+](https://nodejs.org/) (ships with `fetch`, used by the scripts)
- [Python 3.10+](https://www.python.org/) if you need to re-run the scraping utility
- Optional: `@mermaid-js/mermaid-cli` for exporting static SVGs from `.mmd` files

## Running locally

```bash
git clone https://github.com/thomasedarby/derbysbus.git
cd derbysbus
npx serve .   # or python -m http.server 8080
```

Then open `http://localhost:3000` (or whichever port your static server prints) and browse the diagrams.

## Updating the existing diagrams & data

Whenever Mermaid files change, rebuild the manifest and structured JSON:

```bash
node scripts/generate-manifest.mjs
node scripts/build-structured-data.mjs
```

Commit the updated files in `data/`, `diagrams/`, and `exports/` so the UI and downloads stay aligned.

## Recreating the full pipeline for another site

1. **Mirror the target site** with `wget` (replace the URL with the site you are auditing):

   ```bash
   wget \
     --mirror \
     --convert-links \
     --adjust-extension \
     --page-requisites \
     --no-parent \
     https://example.com/
   ```

   This produces `www.example.com/` containing every HTML page, timetable PDF, map image, and asset.

2. **Set up a Python environment** inside your project folder:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install beautifulsoup4
   ```

3. **Drop in `scrape_tables.py`** beside the mirrored folder. The script should:

   - Iterate through all HTML files
   - Identify sections/headings to retain structural context
   - Capture timetable PDFs, map images, and other linked assets while skipping decorative chrome
   - Emit the CSV inventories (`page_inventory.csv`, `asset_inventory.csv`) and the Mermaid diagrams under `diagrams/`

4. **Run the extractor**:

   ```bash
   python3 scrape_tables.py
   ```

   New diagrams land inside `diagrams/`, CSVs under `exports/`, and supporting JSON (e.g. `table_pdf_map.json`).

5. **Optionally export SVGs** via Mermaid CLI:

   ```bash
   npm install -g @mermaid-js/mermaid-cli

   for file in diagrams/pages/*.mmd; do
     mmdc -i "$file" -o "${file%.mmd}.svg"
   done
   mmdc -i diagrams/sitemap.mmd -o diagrams/sitemap.svg
   ```

6. **Publish or host** the refreshed viewer (GitHub Pages, Netlify, SharePoint, Confluence, etc.).

## Helpful scripts

| Script                                   | Purpose                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `node scripts/generate-manifest.mjs`     | Recrawls `diagrams/`, builds `data/diagrams.json`, and enriches each entry with friendly names/URLs/descriptions. |
| `node scripts/build-structured-data.mjs` | Converts `exports/asset_inventory.csv` into a hierarchical JSON map (`data/table_pdf_map.json`).                  |

## Contributing

Issues and pull requests are welcome. Please describe the dataset or diagram you are updating so we can keep the manifest, exports, and viewer synchronized.

## License

Distributed under the [MIT License](./LICENSE).
