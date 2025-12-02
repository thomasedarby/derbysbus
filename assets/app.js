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
};

const CATEGORY_ORDER = ['Overview', 'Home & Index', 'Maps', 'Places Index', 'Timetables', 'Pages', 'Other'];
const VIEWPORT = Object.freeze({
  paddingX: 24,
  paddingY: 24,
  minHeight: 420,
  extraSpace: 48,
});

init();

async function init() {
  try {
    const response = await fetch('data/diagrams.json');
    if (!response.ok) {
      throw new Error('Unable to load diagram manifest');
    }

    state.diagrams = await response.json();
    elements.count.textContent = state.diagrams.length;
    setStructureCopyAvailability(false);

    buildCategoryFilters();
    attachEventListeners();
    applyFilters();

    const hashId = window.location.hash.replace('#', '');
    if (hashId) {
      const match = state.diagrams.find((diagram) => diagram.id === hashId);
      if (match) {
        selectDiagram(match, { updateHash: false });
        return;
      }
    }

    if (state.diagrams.length) {
      selectDiagram(state.diagrams[0], { updateHash: false });
    }
  } catch (error) {
    displayGlobalError(error.message);
  }
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
  elements.search.addEventListener('input', (event) => {
    state.searchQuery = event.target.value.toLowerCase().trim();
    applyFilters();
  });

  elements.copyLink?.addEventListener('click', async () => {
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

  elements.copyStructure?.addEventListener('click', async () => {
    if (!state.structureText) return;
    try {
      await navigator.clipboard.writeText(state.structureText);
      flashButtonStatus(elements.copyStructure, 'Copied', 'Copy outline');
    } catch (error) {
      flashButtonStatus(elements.copyStructure, 'Unable to copy', 'Copy outline');
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

  elements.instructionsButton?.addEventListener('click', openInstructionsModal);
  elements.instructionsClose?.addEventListener('click', closeInstructionsModal);
  elements.modalBackdrop?.addEventListener('click', closeInstructionsModal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.instructionsModal?.hidden) {
      closeInstructionsModal();
    }
  });

  elements.diagramToolbar.addEventListener('click', (event) => {
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

    const haystack = `${diagram.name} ${diagram.displayPath}`.toLowerCase();
    const matchesSearch = !state.searchQuery || haystack.includes(state.searchQuery);

    return matchesCategory && matchesSearch;
  });

  renderDiagramList();
}

function renderDiagramList() {
  elements.list.innerHTML = '';

  if (!state.filteredDiagrams.length) {
    const empty = document.createElement('li');
    empty.className = 'diagram-item diagram-item--empty';
    empty.setAttribute('role', 'status');
    empty.textContent = 'No diagrams match your filters yet.';
    elements.list.appendChild(empty);
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
  state.activeDiagram = diagram;
  updateCategoryButtons();

  elements.viewerTitle.textContent = diagram.name;
  elements.viewerCategory.textContent = diagram.category ?? 'Diagram';
  elements.viewerPath.textContent = diagram.displayPath;
  setViewerDescription(diagram.description);
  setViewPageLink(diagram.url);
  elements.downloadLink.href = diagram.file;
  elements.downloadLink.setAttribute('download', `${diagram.name}.mmd`);

  if (options.updateHash) {
    window.history.replaceState(null, '', `#${diagram.id}`);
  }

  renderDiagram(diagram);
  renderDiagramList();
}

async function renderDiagram(diagram) {
  const renderToken = ++state.renderToken;
  resetDiagramViewport();
  elements.diagramContainer.classList.add('loading');
  elements.diagramStage.innerHTML = '';
  elements.diagramToolbar.hidden = true;
  elements.sourceCode.textContent = 'Loading…';
  elements.structureOutput.textContent = 'Deriving outline…';
  setStructureCopyAvailability(false);
  state.structureText = '';
  teardownPanZoom();

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

  elements.diagramStage.innerHTML = `<p class="empty-state">${message}</p>`;
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
  const structureTree = buildStructureTree(source);
  if (!structureTree.length) {
    elements.structureOutput.textContent = 'No outline data detected in this diagram.';
    state.structureText = '';
    setStructureCopyAvailability(false);
    return;
  }

  const outlineText = isSitemapDiagram(diagram)
    ? formatSitemapOutline(structureTree)
    : formatStructureTree(structureTree);
  elements.structureOutput.textContent = outlineText;
  state.structureText = outlineText;
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

function setViewerDescription(description) {
  if (!elements.viewerDescription) return;
  elements.viewerDescription.textContent = description?.trim()
    ? description
    : 'No description available for this page yet.';
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
