import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const assetCsvPath = path.join(projectRoot, 'exports', 'asset_inventory.csv');
const outputPath = path.join(projectRoot, 'data', 'table_pdf_map.json');

async function main() {
  const csvRaw = await fs.readFile(assetCsvPath, 'utf8');
  const lines = csvRaw.split(/\r?\n/).filter((line) => line.trim().length);
  const header = lines.shift();
  if (!header) {
    throw new Error('CSV contains no header row');
  }

  const headers = header.split(',');
  const pages = new Map();

  for (const line of lines) {
    const cells = splitCsvLine(line, headers.length);
    if (!cells || cells.length < headers.length) continue;

    const entry = Object.fromEntries(headers.map((key, idx) => [key.trim(), cells[idx]?.trim() ?? '']));
    const pagePath = entry['Page Path'];
    if (!pagePath) continue;

    const page = ensurePage(pages, pagePath, entry['Page Title']);
    const sectionName = entry.Section || 'General';
    const section = ensureSection(page, sectionName);

    section.items.push({
      assetClass: entry['Asset Class'],
      fileExt: entry['File Ext'],
      relativeUrl: entry['Relative URL'],
      absoluteUrl: entry['Absolute URL'],
      label: entry.Label,
      fromTag: entry['From Tag'],
      isImageLinked: entry['Is Image Linked'] === 'True',
      routeNumbers: entry['Route Numbers'] ? entry['Route Numbers'].split('|').map((value) => value.trim()).filter(Boolean) : [],
    });

    incrementCounts(page, entry['Asset Class']);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    pageCount: pages.size,
    pages: Array.from(pages.values())
      .map((page) => ({
        pagePath: page.pagePath,
        pageTitle: page.pageTitle,
        assetCounts: page.assetCounts,
        sections: Array.from(page.sectionsMap.values()),
      }))
      .sort((a, b) => a.pagePath.localeCompare(b.pagePath)),
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Structured data written to ${path.relative(projectRoot, outputPath)}`);
}

function splitCsvLine(line, expectedColumns) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  while (result.length < expectedColumns) {
    result.push('');
  }
  return result;
}

function ensurePage(pages, pagePath, title) {
  if (!pages.has(pagePath)) {
    pages.set(pagePath, {
      pagePath,
      pageTitle: title,
      assetCounts: { pdf: 0, map: 0, image: 0, other: 0 },
      sectionsMap: new Map(),
    });
  }
  return pages.get(pagePath);
}

function ensureSection(page, sectionName) {
  if (!page.sectionsMap.has(sectionName)) {
    page.sectionsMap.set(sectionName, {
      name: sectionName,
      items: [],
    });
  }
  return page.sectionsMap.get(sectionName);
}

function incrementCounts(page, assetClass) {
  const key = (assetClass || '').toLowerCase();
  if (key.includes('pdf')) {
    page.assetCounts.pdf += 1;
  } else if (key.includes('map')) {
    page.assetCounts.map += 1;
  } else if (key.includes('image')) {
    page.assetCounts.image += 1;
  } else {
    page.assetCounts.other += 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
