import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const diagramsDir = path.join(projectRoot, 'diagrams');
const outputFile = path.join(projectRoot, 'data', 'diagrams.json');
const BASE_URL = 'https://www.derbysbus.info';

const categoryMap = {
  maps: 'Maps',
  places: 'Places Index',
  times: 'Timetables',
  index: 'Home & Index',
};

async function readDirRecursive(dir, relativeDir = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    const relPath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      const nested = await readDirRecursive(entryPath, relPath);
      items.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.mmd')) {
      const normalizedRel = relPath.split(path.sep).join('/');
      const baseName = path.basename(entry.name, '.mmd');
      const diagramLabel = await extractPrimaryLabel(entryPath, baseName);
      const friendlyName = buildFriendlyName(diagramLabel ?? baseName);

      const pagePath = extractPagePath(diagramLabel ?? baseName);
      items.push({
        id: slugify(normalizedRel),
        name: friendlyName,
        sourcePath: normalizedRel,
        displayPath: diagramLabel ?? normalizedRel.replace(/\.mmd$/i, ''),
        file: `diagrams/${normalizedRel}`,
        category: deriveCategory(normalizedRel),
        url: buildAbsoluteUrl(pagePath),
        description: null,
      });
    }
  }

  return items;
}

async function extractPrimaryLabel(filePath, nodeId) {
  const contents = await fs.readFile(filePath, 'utf8');
  const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelRegex = new RegExp(`${escapedNodeId}\\s*\\["([^"\\n]+)"\\]`);
  const match = contents.match(labelRegex);
  return match ? match[1] : null;
}

function buildFriendlyName(rawValue) {
  if (!rawValue) return '';
  const withoutExt = rawValue
    .split('/')
    .map((segment) => segment.split('.')[0])
    .join(' ');

  return withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveCategory(relativePath) {
  const [first, second] = relativePath.split('/');
  if (!second) return 'Overview';

  if (first === 'pages') {
    const prefix = second.split('_')[0];
    return categoryMap[prefix] ?? 'Pages';
  }

  return 'Other';
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function extractPagePath(label) {
  if (!label) return null;
  const pathMatch = label.match(/\(([^)]+\.(?:html?|htm\.tmp\.html))\)\s*$/i);
  const candidate = pathMatch ? pathMatch[1] : label;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!/\.(?:html?|htm\.tmp\.html)/i.test(trimmed)) return null;
  return trimmed
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^(\.\.\/)+/, '');
}

function buildAbsoluteUrl(pagePath) {
  if (!pagePath) return null;
  if (/^https?:\/\//i.test(pagePath)) return pagePath;
  const sanitized = pagePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (!sanitized) return null;
  return `${BASE_URL.replace(/\/$/, '')}/${sanitized}`;
}

async function enrichDiagrams(diagrams) {
  for (const diagram of diagrams) {
    if (!diagram.url) continue;
    diagram.description = await fetchPageDescription(diagram.url);
  }
}

async function fetchPageDescription(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const html = await response.text();
    return extractDescriptionFromHtml(html);
  } catch (error) {
    console.warn(`Description unavailable for ${url}: ${error.message}`);
    return null;
  }
}

function extractDescriptionFromHtml(html) {
  if (!html) return null;
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch) {
    return decodeEntities(metaMatch[1]).trim();
  }

  const paragraphMatch = html.match(/<p[^>]*>(.*?)<\/p>/is);
  if (paragraphMatch) {
    return truncateText(stripHtml(paragraphMatch[1]));
  }

  return null;
}

function stripHtml(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function truncateText(text, maxLength = 240) {
  if (!text) return text;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function main() {
  try {
    const diagrams = await readDirRecursive(diagramsDir);
    await enrichDiagrams(diagrams);
    diagrams.sort((a, b) => a.name.localeCompare(b.name));

    await fs.writeFile(outputFile, JSON.stringify(diagrams, null, 2), 'utf8');
    console.log(`Manifest written to ${path.relative(projectRoot, outputFile)} (${diagrams.length} diagrams)`);
  } catch (error) {
    console.error('Unable to generate manifest:', error);
    process.exitCode = 1;
  }
}

main();
