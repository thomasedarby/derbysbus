mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const elements = {
  list: document.getElementById('diagramList'),
  count: document.getElementById('diagramCount'),
  filters: document.getElementById('categoryFilters'),
  search: document.getElementById('searchInput'),
  viewerTitle: document.getElementById('viewerTitle'),
  viewerCategory: document.getElementById('viewerCategory'),
  viewerPath: document.getElementById('viewerPath'),
  viewerDescription: document.getElementById('viewerDescription'),
  diagramContainer: document.getElementById('diagramContainer'),
  diagramStage: document.getElementById('diagramStage'),
  diagramToolbar: document.getElementById('diagramToolbar'),
  sourceCode: document.getElementById('sourceCode'),
  structureOutput: document.getElementById('structureOutput'),
  downloadLink: document.getElementById('downloadLink'),
  copyLink: document.getElementById('copyLink'),
  viewPageLink: document.getElementById('viewPageLink'),
  copyStructure: document.getElementById('copyStructure'),
  instructionsButton: document.getElementById('instructionsButton'),
  instructionsModal: document.getElementById('instructionsModal'),
  instructionsClose: document.getElementById('instructionsClose'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  aggregateView: document.getElementById('aggregateView'),
  aggregateOutput: document.getElementById('aggregateOutput'),
  copyAggregate: document.getElementById('copyAggregate'),
  dataPanels: document.querySelector('.data-panels'),
};

const state = {
  diagrams: [],
  filteredDiagrams: [],
  activeCategory: 'All',
  searchQuery: '',
  activeDiagram: null,
  panZoom: null,
  structureText: '',
  renderToken: 0,
  outlineCache: new Map(),
  outlinePromises: new Map(),
  aggregate: {
    status: 'idle',
    promise: null,
    text: '',
    token: 0,
  },
};

const CATEGORY_ORDER = ['Overview', 'Home & Index', 'Maps', 'Places Index', 'Timetables', 'Pages', 'Other'];
const AGGREGATE_VIEW_ID = 'structured-outline-overview';
const VIEWPORT = Object.freeze({
  paddingX: 24,
  paddingY: 24,
  minHeight: 420,
  extraSpace: 48,
});
const TEXT = Object.freeze({
  aggregateDescription: 'Combined structured outline data from every Mermaid diagram.',
  defaultDescription: 'No description available for this page yet.',
  noOutline: 'No outline data detected in this diagram.',
  derivingOutline: 'Deriving outline…',
  loadingSource: 'Loading…',
  missingDiagramFile: 'Diagram source path missing for this entry.',
});

function addListener(element, eventName, handler) {
  if (!element) return;
  element.addEventListener(eventName, handler);
}

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function createStatusMessage(text, className = 'empty-state') {
  const message = document.createElement('p');
  message.className = className;
  message.textContent = text;
  return message;
}

init();

async function init() {
  try {
    const response = await fetch('data/diagrams.json');
    if (!response.ok) {
      throw new Error('Unable to load diagram manifest');
    }

    const manifest = await response.json();
    state.diagrams = prepareDiagramEntries(manifest);
    elements.count.textContent = getRealDiagrams().length;
    setStructureCopyAvailability(false);

    buildCategoryFilters();
    attachEventListeners();
    applyFilters();

    const defaultDiagram = getRealDiagrams()[0] ?? state.diagrams[0];

    const hashId = window.location.hash.replace('#', '');
    if (hashId) {
      const match = state.diagrams.find((diagram) => diagram.id === hashId);
      if (match) {
        selectDiagram(match, { updateHash: false });
        return;
      }
    }

    if (defaultDiagram) {
      selectDiagram(defaultDiagram, { updateHash: false });
    }
  } catch (error) {
    displayGlobalError(error.message);
  }
}

function prepareDiagramEntries(diagrams) {
  const ordered = reorderDiagrams(diagrams ?? []);
  return [buildAggregateEntry(), ...ordered];
}

function reorderDiagrams(diagrams) {
  const items = Array.from(diagrams ?? []);
  const sitemapIndex = items.findIndex(isSitemapEntry);
  if (sitemapIndex > -1) {
    const [sitemapDiagram] = items.splice(sitemapIndex, 1);
    items.unshift(sitemapDiagram);
  }
  return items;
}

function isSitemapEntry(diagram) {
  const source = `${diagram?.sourcePath ?? ''} ${diagram?.name ?? ''}`.toLowerCase();
  return source.includes('sitemap');
}

function buildAggregateEntry() {
  return {
    id: AGGREGATE_VIEW_ID,
    name: 'Structured outline overview',
    displayPath: 'All diagrams',
    category: 'Overview',
    description: 'Combined structured outline data from every Mermaid diagram.',
    isAggregateOverview: true,
  };
}

function buildCategoryFilters() {
  elements.filters.innerHTML = '';
  const categories = Array.from(new Set(state.diagrams.map((item) => item.category)));
  categories.sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a);
    const indexB = CATEGORY_ORDER.indexOf(b);
    const orderA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const orderB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
    return orderA - orderB;
  });

  const ordered = ['All', ...categories.filter(Boolean)];
  ordered.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category;
    if (category === state.activeCategory) {
      button.classList.add('active');
    }

    button.addEventListener('click', () => {
      state.activeCategory = category;
      updateCategoryButtons();
      applyFilters();
    });

    elements.filters.appendChild(button);
  });
}

function attachEventListeners() {
  addListener(elements.search, 'input', (event) => {
    state.searchQuery = event.target.value.toLowerCase().trim();
    applyFilters();
  });

  addListener(elements.copyLink, 'click', async () => {
    if (!state.activeDiagram) return;
    const url = new URL(window.location.href);
    url.hash = state.activeDiagram.id;

    try {
      await navigator.clipboard.writeText(url.toString());
      flashButtonStatus(elements.copyLink, 'Link copied', 'Copy share link');
    } catch (error) {
      flashButtonStatus(elements.copyLink, 'Unable to copy', 'Copy share link');
      console.error('Clipboard error', error);
    }
  });

  addListener(elements.copyStructure, 'click', async () => {
    if (!state.structureText) return;
    try {
      await navigator.clipboard.writeText(state.structureText);
      flashButtonStatus(elements.copyStructure, 'Copied', 'Copy outline');
    } catch (error) {
      flashButtonStatus(elements.copyStructure, 'Unable to copy', 'Copy outline');
      console.error('Clipboard error', error);
    }
  });

  addListener(elements.copyAggregate, 'click', async () => {
    if (!state.aggregate.text) return;
    try {
      await navigator.clipboard.writeText(state.aggregate.text);
      flashButtonStatus(elements.copyAggregate, 'Copied', 'Copy overview');
    } catch (error) {
      flashButtonStatus(elements.copyAggregate, 'Unable to copy', 'Copy overview');
      console.error('Clipboard error', error);
    }
  });

  window.addEventListener('hashchange', () => {
    const nextId = window.location.hash.replace('#', '');
    if (!nextId) return;

    const nextDiagram = state.diagrams.find((diagram) => diagram.id === nextId);
    if (nextDiagram && nextDiagram.id !== state.activeDiagram?.id) {
      selectDiagram(nextDiagram, { updateHash: false });
    }
  });

  window.addEventListener('resize', () => {
    refreshPanZoomView();
  });

  addListener(elements.instructionsButton, 'click', openInstructionsModal);
  addListener(elements.instructionsClose, 'click', closeInstructionsModal);
  addListener(elements.modalBackdrop, 'click', closeInstructionsModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.instructionsModal?.hidden) {
      closeInstructionsModal();
    }
  });

  addListener(elements.diagramToolbar, 'click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;
    handleToolbarAction(target.dataset.action);
  });
}

function openInstructionsModal() {
  if (!elements.instructionsModal) return;
  elements.instructionsModal.hidden = false;
  document.body.classList.add('modal-open');
  elements.instructionsClose?.focus();
}

function closeInstructionsModal() {
  if (!elements.instructionsModal) return;
  if (!elements.instructionsModal.hidden) {
    elements.instructionsModal.hidden = true;
    document.body.classList.remove('modal-open');
  }
}

function flashButtonStatus(button, message, fallbackText) {
  if (!button) return;
  const previousText = fallbackText ?? button.textContent;
  button.textContent = message;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = previousText;
    button.disabled = false;
  }, 1800);
}

function updateCategoryButtons() {
  const buttons = elements.filters.querySelectorAll('button');
  buttons.forEach((button) => {
    const isActive = button.textContent === state.activeCategory;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function applyFilters() {
  state.filteredDiagrams = state.diagrams.filter((diagram) => {
    const matchesCategory =
      state.activeCategory === 'All' || diagram.category === state.activeCategory;

    const haystack = `${safeString(diagram.name)} ${safeString(diagram.displayPath)}`.toLowerCase();
    const matchesSearch = !state.searchQuery || haystack.includes(state.searchQuery);

    return matchesCategory && matchesSearch;
  });

  renderDiagramList();
}

function renderDiagramList() {
  elements.list.innerHTML = '';

  if (!state.filteredDiagrams.length) {
    const listItem = document.createElement('li');
    const placeholder = document.createElement('div');
    placeholder.className = 'diagram-item diagram-item--empty';
    placeholder.setAttribute('role', 'status');
    placeholder.textContent = 'No diagrams match your filters yet.';
    listItem.appendChild(placeholder);
    elements.list.appendChild(listItem);
    return;
  }

  state.filteredDiagrams.forEach((diagram) => {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'diagram-item';
    button.dataset.diagramId = diagram.id;

    const isActive = diagram.id === state.activeDiagram?.id;
    button.classList.toggle('active', isActive);
    if (isActive) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }

    const title = document.createElement('h3');
    title.textContent = diagram.name;

    const pathLine = document.createElement('p');
    pathLine.textContent = diagram.displayPath;

    button.append(title, pathLine);
    button.addEventListener('click', () => selectDiagram(diagram));

    listItem.appendChild(button);
    elements.list.appendChild(listItem);
  });
}

function selectDiagram(diagram, options = { updateHash: true }) {
  if (!diagram) return;
  state.activeDiagram = diagram;
  updateCategoryButtons();

  const isAggregate = Boolean(diagram.isAggregateOverview);

  elements.viewerTitle.textContent = diagram.name;
  elements.viewerCategory.textContent = diagram.category ?? 'Diagram';
  elements.viewerPath.textContent = diagram.displayPath ?? '';
  setViewerDescription(isAggregate ? TEXT.aggregateDescription : diagram.description);
  elements.downloadLink.hidden = isAggregate;
  setViewPageLink(isAggregate ? null : diagram.url);
  if (!isAggregate) {
    elements.downloadLink.href = diagram.file;
    elements.downloadLink.setAttribute('download', `${diagram.name}.mmd`);
  }

  if (options.updateHash) {
    window.history.replaceState(null, '', `#${diagram.id}`);
  }

  if (isAggregate) {
    showAggregateView();
  } else {
    hideAggregateView();
    renderDiagram(diagram);
  }

  renderDiagramList();
}

async function renderDiagram(diagram) {
  const renderToken = ++state.renderToken;
  resetDiagramViewport();
  elements.diagramContainer.classList.add('loading');
  elements.diagramStage.innerHTML = '';
  elements.diagramToolbar.hidden = true;
  elements.sourceCode.textContent = TEXT.loadingSource;
  elements.structureOutput.textContent = TEXT.derivingOutline;
  setStructureCopyAvailability(false);
  state.structureText = '';
  teardownPanZoom();

  if (!diagram?.file) {
    elements.diagramStage.appendChild(createStatusMessage(TEXT.missingDiagramFile));
    elements.structureOutput.textContent = TEXT.noOutline;
    elements.diagramContainer.classList.remove('loading');
    return;
  }

  try {
    const response = await fetch(diagram.file);
    if (!response.ok) {
      throw new Error('Unable to load Mermaid file');
    }

    const source = await response.text();
    if (renderToken !== state.renderToken) {
      return;
    }
    elements.sourceCode.textContent = source;
    populateStructurePanel(diagram, source);

    const { svg } = await mermaid.render(`diagram-${diagram.id}-${Date.now()}`, source);
    if (renderToken !== state.renderToken) {
      return;
    }
    elements.diagramStage.innerHTML = svg;
    initializePanZoom();
  } catch (error) {
    if (renderToken !== state.renderToken) {
      console.error(error);
      return;
    }
    const message = document.createElement('p');
    message.className = 'empty-state';
    message.textContent = `Rendering failed: ${error.message}`;
    elements.diagramStage.appendChild(message);
    console.error(error);
    elements.structureOutput.textContent = 'Unable to derive outline for this diagram.';
  } finally {
    if (renderToken === state.renderToken) {
      elements.diagramContainer.classList.remove('loading');
    }
  }
}

function displayGlobalError(message) {
  elements.list.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'diagram-item';
  li.textContent = message;
  elements.list.appendChild(li);

  elements.diagramStage.innerHTML = '';
  elements.diagramStage.appendChild(createStatusMessage(message));
  elements.structureOutput.textContent = message;
  setStructureCopyAvailability(false);
  setViewerDescription(null);
  setViewPageLink(null);
  resetDiagramViewport();
  teardownPanZoom();
}

function initializePanZoom() {
  const svgElement = elements.diagramStage.querySelector('svg');
  if (!svgElement || typeof window.svgPanZoom !== 'function') {
    return;
  }

  applyViewportSizing(svgElement);

  teardownPanZoom();

  state.panZoom = window.svgPanZoom(svgElement, {
    controlIconsEnabled: false,
    fit: true,
    center: true,
    minZoom: 0.2,
    maxZoom: 10,
    zoomScaleSensitivity: 0.3,
    contain: false,
    dblClickZoomEnabled: true,
  });

  elements.diagramToolbar.hidden = false;
  refreshPanZoomView();
}

function teardownPanZoom() {
  if (state.panZoom) {
    state.panZoom.destroy();
    state.panZoom = null;
  }
  elements.diagramToolbar.hidden = true;
}

function refreshPanZoomView() {
  if (!state.panZoom) return;
  state.panZoom.resize();
  state.panZoom.fit();
  state.panZoom.center();
}

function resetDiagramViewport() {
  elements.diagramContainer.style.minHeight = `${VIEWPORT.minHeight}px`;
  elements.diagramStage.style.height = '';
}

function applyViewportSizing(svgElement) {
  if (!svgElement) {
    resetDiagramViewport();
    return;
  }

  const bbox = svgElement.getBBox();
  if (!bbox || bbox.width === 0 || bbox.height === 0) {
    resetDiagramViewport();
    return;
  }

  const paddedWidth = bbox.width + VIEWPORT.paddingX * 2;
  const paddedHeight = bbox.height + VIEWPORT.paddingY * 2;

  svgElement.setAttribute('width', paddedWidth);
  svgElement.setAttribute('height', paddedHeight);
  svgElement.setAttribute(
    'viewBox',
    `${bbox.x - VIEWPORT.paddingX} ${bbox.y - VIEWPORT.paddingY} ${paddedWidth} ${paddedHeight}`,
  );

  svgElement.style.width = '100%';
  svgElement.style.height = '100%';

  const stageWidth = Math.max(elements.diagramStage.clientWidth || 0, paddedWidth);
  const aspectRatio = paddedHeight / paddedWidth;
  const projectedHeight = stageWidth * aspectRatio;
  const containerHeight = Math.max(paddedHeight, projectedHeight, VIEWPORT.minHeight) + VIEWPORT.extraSpace;

  elements.diagramContainer.style.minHeight = `${containerHeight}px`;
}

function showAggregateView() {
  elements.diagramContainer.hidden = true;
  elements.aggregateView.hidden = false;
  elements.dataPanels.hidden = true;
  teardownPanZoom();
  setStructureCopyAvailability(false);
  state.structureText = '';

  if (state.aggregate.status === 'ready' && state.aggregate.text) {
    elements.aggregateOutput.textContent = state.aggregate.text;
    setAggregateCopyAvailability(true);
  } else {
    elements.aggregateOutput.textContent = 'Building outline overview…';
    setAggregateCopyAvailability(false);
  }

  const token = ++state.aggregate.token;

  loadAggregateOutline()
    .then((text) => {
      if (token !== state.aggregate.token || state.activeDiagram?.id !== AGGREGATE_VIEW_ID) {
        return;
      }
      elements.aggregateOutput.textContent = text || 'No outline data detected yet.';
      setAggregateCopyAvailability(Boolean(text));
    })
    .catch((error) => {
      if (token !== state.aggregate.token || state.activeDiagram?.id !== AGGREGATE_VIEW_ID) {
        return;
      }
      elements.aggregateOutput.textContent = 'Unable to build the outline overview.';
      setAggregateCopyAvailability(false);
      console.error('Aggregate outline error', error);
    });
}

function hideAggregateView() {
  elements.aggregateView.hidden = true;
  elements.diagramContainer.hidden = false;
  elements.dataPanels.hidden = false;
  setAggregateCopyAvailability(false);
}

function loadAggregateOutline() {
  if (state.aggregate.status === 'ready') {
    return Promise.resolve(state.aggregate.text);
  }

  if (state.aggregate.status === 'loading' && state.aggregate.promise) {
    return state.aggregate.promise;
  }

  state.aggregate.status = 'loading';
  state.aggregate.promise = buildAggregateOutline()
    .then((text) => {
      state.aggregate.status = 'ready';
      state.aggregate.text = text;
      state.aggregate.promise = null;
      return text;
    })
    .catch((error) => {
      state.aggregate.status = 'idle';
      state.aggregate.text = '';
      state.aggregate.promise = null;
      throw error;
    });

  return state.aggregate.promise;
}

async function buildAggregateOutline() {
  const diagrams = getRealDiagrams().filter(Boolean);
  if (!diagrams.length) {
    return '';
  }

  const outlineEntries = await Promise.all(
    diagrams.map(async (diagram) => ({
      diagram,
      outline: await getDiagramOutline(diagram),
    })),
  );

  const lines = [];
  outlineEntries.forEach(({ diagram, outline }) => {
    if (!outline) return;
    lines.push(`Diagram: ${diagram.name}`);
    if (diagram.displayPath) {
      lines.push(`Path: ${diagram.displayPath}`);
    }
    lines.push(`Category: ${diagram.category ?? 'Diagram'}`);
    lines.push('');
    lines.push(outline);
    lines.push('');
  });

  return lines.join('\n').trim();
}

async function getDiagramOutline(diagram) {
  if (!diagram) return '';
  if (state.outlineCache.has(diagram.id)) {
    return state.outlineCache.get(diagram.id);
  }
  if (state.outlinePromises.has(diagram.id)) {
    return state.outlinePromises.get(diagram.id);
  }
  if (!diagram.file) {
    console.warn(`Diagram "${diagram.name}" is missing a Mermaid source file`);
    state.outlineCache.set(diagram.id, '');
    return '';
  }

  const outlinePromise = fetch(diagram.file)
    .then((response) => {
      if (!response.ok) {
        throw new Error('Unable to load Mermaid file');
      }
      return response.text();
    })
    .then((source) => {
      const outline = deriveOutline(diagram, source);
      state.outlineCache.set(diagram.id, outline ?? '');
      return outline ?? '';
    })
    .catch((error) => {
      console.error(`Unable to derive outline for ${diagram.name}`, error);
      state.outlineCache.set(diagram.id, '');
      return '';
    })
    .finally(() => {
      state.outlinePromises.delete(diagram.id);
    });

  state.outlinePromises.set(diagram.id, outlinePromise);
  return outlinePromise;
}

function deriveOutline(diagram, source) {
  const structureTree = buildStructureTree(source);
  if (!structureTree.length) return '';
  return isSitemapDiagram(diagram)
    ? formatSitemapOutline(structureTree)
    : formatStructureTree(structureTree);
}

function getRealDiagrams() {
  return state.diagrams.filter((diagram) => !diagram.isAggregateOverview);
}

function handleToolbarAction(action) {
  if (!state.panZoom) return;

  switch (action) {
    case 'zoom-in':
      state.panZoom.zoomBy(1.2);
      break;
    case 'zoom-out':
      state.panZoom.zoomBy(0.8);
      break;
    case 'reset':
      state.panZoom.resetZoom();
      state.panZoom.center();
      break;
    case 'fit':
      state.panZoom.fit();
      state.panZoom.center();
      break;
    default:
      break;
  }
}

function populateStructurePanel(diagram, source) {
  const outlineText = deriveOutline(diagram, source);
  if (!outlineText) {
    elements.structureOutput.textContent = TEXT.noOutline;
    state.structureText = '';
    setStructureCopyAvailability(false);
    return;
  }
  elements.structureOutput.textContent = outlineText;
  state.structureText = outlineText;
  state.outlineCache.set(diagram.id, outlineText);
  setStructureCopyAvailability(true);
}

function buildStructureTree(source) {
  const nodeRegex = /^\s*([A-Za-z0-9_]+)\s*\["([^"\n]+)"\]/gm;
  const edgeRegex = /^\s*([A-Za-z0-9_]+)\s*[-.=]{1,4}>\s*([A-Za-z0-9_]+)/gm;
  const labels = new Map();
  const childrenMap = new Map();
  const indegree = new Map();

  let match;
  while ((match = nodeRegex.exec(source)) !== null) {
    const [, id, label] = match;
    labels.set(id, label.trim());
    if (!indegree.has(id)) indegree.set(id, 0);
  }

  while ((match = edgeRegex.exec(source)) !== null) {
    const [, parentId, childId] = match;
    if (!labels.has(parentId)) labels.set(parentId, parentId);
    if (!labels.has(childId)) labels.set(childId, childId);

    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId).push(childId);

    indegree.set(childId, (indegree.get(childId) ?? 0) + 1);
    if (!indegree.has(parentId)) indegree.set(parentId, 0);
  }

  const roots = Array.from(labels.keys()).filter((id) => (indegree.get(id) ?? 0) === 0);
  const visited = new Set();

  return roots
    .map((rootId) => buildNode(rootId, visited, labels, childrenMap))
    .filter(Boolean);
}

function buildNode(id, visited, labels, childrenMap) {
  if (visited.has(id)) return null;
  visited.add(id);
  const node = {
    id,
    label: labels.get(id) ?? id,
    children: [],
  };

  const children = childrenMap.get(id) ?? [];
  for (const childId of children) {
    const childNode = buildNode(childId, visited, labels, childrenMap);
    if (childNode) {
      node.children.push(childNode);
    }
  }

  visited.delete(id);
  return node;
}

function formatStructureTree(roots) {
  const lines = [];

  roots.forEach((root, index) => {
    lines.push(`Page: ${root.label}`);
    appendChildren(root.children, 0, lines);
    if (index < roots.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}

function appendChildren(children, depth, lines) {
  const indent = '  '.repeat(depth);
  children.forEach((child) => {
    lines.push(`${indent}- ${child.label}`);
    appendChildren(child.children, depth + 1, lines);
  });
}

function formatSitemapOutline(structureTree) {
  const [root] = structureTree;
  if (!root) return '';

  const lines = [`Page: ${expandSitemapText(root.label)}`];
  root.children.forEach((child, index) => {
    const { primaryLine, statsLines } = splitSitemapLabel(child.label);
    lines.push(`- ${primaryLine}`);
    statsLines.forEach((line) => lines.push(line));
    if (index < root.children.length - 1) {
      lines.push('');
    }
  });

  return lines.join('\n');
}

function splitSitemapLabel(label) {
  const expanded = expandSitemapText(label);
  const [primary = label, ...rest] = expanded.split('\n');
  const statsLines = rest.map((segment) => segment.trim()).filter(Boolean);
  return {
    primaryLine: primary.trim(),
    statsLines,
  };
}

function expandSitemapText(text) {
  return text.replace(/\\n/g, '\n');
}

function setStructureCopyAvailability(isEnabled) {
  if (!elements.copyStructure) return;
  elements.copyStructure.disabled = !isEnabled;
}

function setAggregateCopyAvailability(isEnabled) {
  if (!elements.copyAggregate) return;
  elements.copyAggregate.disabled = !isEnabled;
}

function setViewerDescription(description) {
  if (!elements.viewerDescription) return;
  elements.viewerDescription.textContent = description?.trim()
    ? description
    : TEXT.defaultDescription;
}

function setViewPageLink(url) {
  if (!elements.viewPageLink) return;
  if (url) {
    elements.viewPageLink.href = url;
    elements.viewPageLink.hidden = false;
  } else {
    elements.viewPageLink.hidden = true;
    elements.viewPageLink.removeAttribute('href');
  }
}

function isSitemapDiagram(diagram) {
  if (!diagram) return false;
  return diagram.id === 'sitemap-mmd' || /sitemap\.mmd$/i.test(diagram.sourcePath ?? '');
}
