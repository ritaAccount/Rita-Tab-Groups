(function () {
  const vscodeApi = acquireVsCodeApi();

  const queryInput = document.getElementById('query');
  const clearButton = document.getElementById('clear');
  const fuzzyButton = document.getElementById('modeFuzzy');
  const exactButton = document.getElementById('modeExact');
  const settingsButton = document.getElementById('settingsBtn');
  const settingsClip = document.getElementById('settingsClip');
  const settingsPanel = document.getElementById('settingsPanel');
  const includeInput = document.getElementById('include');
  const excludeInput = document.getElementById('exclude');
  const browseInclude = document.getElementById('browseInclude');
  const browseExclude = document.getElementById('browseExclude');
  const hoverTip = document.getElementById('hoverTip');
  const treeRoot = document.getElementById('treeRoot');

  /** @type {string[]} */
  let history = [];
  let historyIndex = -1;
  let draftQuery = '';
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let queryTimer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let folderTimer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hoverTimer;
  /** @type {HTMLElement | undefined} */
  let hoverTarget;

  function post(message) {
    vscodeApi.postMessage(message);
  }

  function readState() {
    const state = vscodeApi.getState();
    return state && typeof state === 'object' ? state : {};
  }

  function writeState(partial) {
    vscodeApi.setState({ ...readState(), ...partial });
  }

  function setMode(mode) {
    const isFuzzy = mode !== 'exact';
    fuzzyButton.setAttribute('aria-pressed', isFuzzy ? 'true' : 'false');
    exactButton.setAttribute('aria-pressed', isFuzzy ? 'false' : 'true');
  }

  function setClearVisible() {
    const hasQuery = Boolean(queryInput.value);
    clearButton.hidden = !hasQuery;
  }

  function setSettingsOpen(open, animate) {
    if (!animate) {
      settingsClip.classList.add('no-animate');
    }
    settingsClip.classList.toggle('open', open);
    document.body.classList.toggle('settings-open', open);
    settingsButton.setAttribute('aria-pressed', open ? 'true' : 'false');
    settingsButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    settingsPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    writeState({ settingsOpen: open });
    if (!animate) {
      void settingsClip.offsetHeight;
      requestAnimationFrame(() => {
        settingsClip.classList.remove('no-animate');
      });
    }
  }

  function hideHoverTip() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
    hoverTarget = undefined;
    hoverTip.hidden = true;
  }

  function placeHoverTip(target) {
    const text = target.getAttribute('data-hover-tip');
    if (!text) {
      return;
    }
    hoverTip.textContent = text;
    hoverTip.hidden = false;
    const rect = target.getBoundingClientRect();
    const tipRect = hoverTip.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - tipRect.height - 6;
    if (top < 4) {
      top = rect.bottom + 6;
    }
    if (left + tipRect.width > window.innerWidth - 4) {
      left = Math.max(4, window.innerWidth - tipRect.width - 4);
    }
    if (left < 4) {
      left = 4;
    }
    hoverTip.style.left = `${left}px`;
    hoverTip.style.top = `${top}px`;
  }

  function bindHoverTip(element) {
    element.addEventListener('mouseenter', () => {
      hoverTarget = element;
      if (hoverTimer) {
        clearTimeout(hoverTimer);
      }
      hoverTimer = setTimeout(() => {
        if (hoverTarget === element) {
          placeHoverTip(element);
        }
      }, 300);
    });
    element.addEventListener('mouseleave', hideHoverTip);
    element.addEventListener('focus', () => {
      hoverTarget = element;
      placeHoverTip(element);
    });
    element.addEventListener('blur', hideHoverTip);
  }

  function emitQuery() {
    post({ type: 'query', query: queryInput.value });
    setClearVisible();
  }

  function scheduleQuery() {
    if (queryTimer) {
      clearTimeout(queryTimer);
    }
    queryTimer = setTimeout(emitQuery, 120);
  }

  function scheduleFolders() {
    if (folderTimer) {
      clearTimeout(folderTimer);
    }
    folderTimer = setTimeout(() => {
      post({
        type: 'folders',
        include: includeInput.value,
        exclude: excludeInput.value,
      });
    }, 300);
  }

  queryInput.addEventListener('input', () => {
    historyIndex = -1;
    scheduleQuery();
  });

  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (history.length === 0) {
        return;
      }
      event.preventDefault();
      if (historyIndex === -1) {
        draftQuery = queryInput.value;
      }
      if (event.key === 'ArrowUp') {
        historyIndex = Math.min(history.length - 1, historyIndex + 1);
      } else if (historyIndex === -1) {
        return;
      } else {
        historyIndex -= 1;
      }
      queryInput.value = historyIndex === -1 ? draftQuery : history[historyIndex];
      emitQuery();
      return;
    }

    if (event.key === 'Enter') {
      post({ type: 'commitQuery', query: queryInput.value });
      historyIndex = -1;
      return;
    }

    if (event.key === 'Escape') {
      queryInput.value = '';
      historyIndex = -1;
      emitQuery();
    }
  });

  clearButton.addEventListener('click', () => {
    queryInput.value = '';
    historyIndex = -1;
    emitQuery();
    queryInput.focus();
  });

  fuzzyButton.addEventListener('click', () => {
    setMode('fuzzy');
    post({ type: 'mode', mode: 'fuzzy' });
  });

  exactButton.addEventListener('click', () => {
    setMode('exact');
    post({ type: 'mode', mode: 'exact' });
  });

  settingsButton.addEventListener('click', () => {
    const open = !settingsClip.classList.contains('open');
    setSettingsOpen(open, true);
  });

  includeInput.addEventListener('input', scheduleFolders);
  excludeInput.addEventListener('input', scheduleFolders);

  includeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      post({
        type: 'folders',
        include: includeInput.value,
        exclude: excludeInput.value,
      });
    }
  });

  excludeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      post({
        type: 'folders',
        include: includeInput.value,
        exclude: excludeInput.value,
      });
    }
  });

  browseInclude.addEventListener('click', () => {
    post({ type: 'pickFolder', field: 'include' });
  });

  browseExclude.addEventListener('click', () => {
    post({ type: 'pickFolder', field: 'exclude' });
  });

  bindHoverTip(queryInput);
  bindHoverTip(includeInput);
  bindHoverTip(excludeInput);

  let selectedId = '';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function iconHtml(node) {
    const icon = node.icon;
    if (icon && icon.kind === 'image') {
      return `<img class="tree-file-icon" src="${escapeHtml(icon.uri)}" alt="">`;
    }
    if (icon && icon.kind === 'font') {
      const family = `tabGroups-fileicon-${escapeHtml(icon.fontId)}`;
      const size = icon.size ? `font-size:${escapeHtml(icon.size)};` : '';
      const color = icon.color ? `color:${escapeHtml(icon.color)};` : '';
      return `<span class="tree-file-icon tree-file-icon-font" style="font-family:'${family}';${size}${color}">${escapeHtml(icon.character)}</span>`;
    }
    const id = (icon && icon.id) || node.iconId || 'file';
    return `<span class="codicon codicon-${escapeHtml(id)}" aria-hidden="true"></span>`;
  }

  function renderNode(node, depth) {
    const level = Math.max(0, Math.min(12, depth));
    const selected = node.id === selectedId ? ' selected' : '';
    const missing = node.missing ? ' missing' : '';
    const twistie = node.collapsible
      ? `<span class="codicon ${node.expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}" aria-hidden="true"></span>`
      : '';
    const plus =
      node.kind === 'group'
        ? `<button type="button" class="tree-plus" data-action="add-child" title="新建子分组"><span class="codicon codicon-add" aria-hidden="true"></span></button>`
        : '';
    const desc = node.description
      ? `<span class="tree-desc">${escapeHtml(node.description)}</span>`
      : '';
    const context = {
      webviewItem: node.contextValue,
      preventDefaultContextMenuItems: true,
    };
    const children = node.expanded && Array.isArray(node.children)
      ? node.children.map((child) => renderNode(child, depth + 1)).join('')
      : '';
    return `<div class="tree-row${selected}${missing}" role="treeitem" data-id="${escapeHtml(node.id)}" data-kind="${escapeHtml(node.kind)}" data-context="${escapeHtml(node.contextValue)}" data-group-id="${escapeHtml(node.groupId || '')}" data-path="${escapeHtml(node.filePath || '')}" data-collapsible="${node.collapsible ? 'true' : 'false'}" data-expanded="${node.expanded ? 'true' : 'false'}" data-vscode-context="${escapeHtml(JSON.stringify(context))}" title="${escapeHtml(node.tooltip || node.label)}"><span class="tree-indent" data-depth="${level}"></span><span class="tree-twistie">${twistie}</span><span class="tree-icon">${iconHtml(node)}</span><span class="tree-label">${escapeHtml(node.label)}</span>${desc}${plus}</div>${children}`;
  }

  function renderTree(nodes, emptyMessage, enabled) {
    if (!enabled) {
      treeRoot.innerHTML = '';
      return;
    }
    if (emptyMessage) {
      treeRoot.innerHTML = `<div class="tree-empty">${escapeHtml(emptyMessage)}</div>`;
      return;
    }
    if (!Array.isArray(nodes) || nodes.length === 0) {
      treeRoot.innerHTML = '';
      return;
    }
    treeRoot.innerHTML = nodes.map((node) => renderNode(node, 0)).join('');
  }

  treeRoot.addEventListener('pointerdown', (event) => {
    const row = event.target.closest('.tree-row');
    if (!row) {
      return;
    }
    selectedId = row.dataset.id || '';
    treeRoot.querySelectorAll('.tree-row.selected').forEach((el) => el.classList.remove('selected'));
    row.classList.add('selected');
    post({ type: 'select', id: selectedId });
  });

  treeRoot.addEventListener('click', (event) => {
    const plus = event.target.closest('[data-action="add-child"]');
    if (plus) {
      event.preventDefault();
      event.stopPropagation();
      const row = plus.closest('.tree-row');
      if (row && row.dataset.id) {
        post({ type: 'run', id: row.dataset.id, command: 'tabGroups.createSubGroup' });
      }
      return;
    }

    const row = event.target.closest('.tree-row');
    if (!row || !row.dataset.id) {
      return;
    }
    if (event.target.closest('.tree-twistie') && row.dataset.collapsible === 'true') {
      post({ type: 'toggle', id: row.dataset.id, expanded: row.dataset.expanded !== 'true' });
      return;
    }
    if (row.dataset.kind === 'file' || row.dataset.kind === 'marker') {
      post({ type: 'activate', id: row.dataset.id });
    }
  });

  treeRoot.addEventListener('dblclick', (event) => {
    const row = event.target.closest('.tree-row');
    if (!row || row.dataset.collapsible !== 'true') {
      return;
    }
    post({ type: 'toggle', id: row.dataset.id, expanded: row.dataset.expanded !== 'true' });
  });

  treeRoot.addEventListener('dragstart', (event) => {
    const row = event.target.closest('.tree-row');
    if (!row || (row.dataset.kind !== 'group' && row.dataset.kind !== 'file')) {
      event.preventDefault();
      return;
    }
    row.setAttribute('draggable', 'true');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/vnd.tabgroups.sidebar',
      JSON.stringify({
        kind: row.dataset.kind,
        groupId: row.dataset.groupId,
        path: row.dataset.path,
      }),
    );
  });

  treeRoot.addEventListener('dragover', (event) => {
    const row = event.target.closest('.tree-row');
    if (!row) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  });

  treeRoot.addEventListener('drop', (event) => {
    event.preventDefault();
    const row = event.target.closest('.tree-row');
    const raw = event.dataTransfer.getData('application/vnd.tabgroups.sidebar');
    if (!raw) {
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const drop = { type: 'drop', targetId: row ? row.dataset.id : undefined };
    if (payload.kind === 'group' && payload.groupId) {
      drop.groupIds = [payload.groupId];
    } else if (payload.kind === 'file' && payload.groupId && payload.path) {
      drop.files = [{ groupId: payload.groupId, path: payload.path }];
    }
    post(drop);
  });

  treeRoot.addEventListener('mousedown', (event) => {
    const row = event.target.closest('.tree-row');
    if (row) {
      row.setAttribute('draggable', row.dataset.kind === 'group' || row.dataset.kind === 'file' ? 'true' : 'false');
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message) {
      return;
    }
    if (message.type === 'init') {
      queryInput.value = message.query || '';
      includeInput.value = message.include || '';
      excludeInput.value = message.exclude || '';
      history = Array.isArray(message.history) ? message.history : [];
      historyIndex = -1;
      setMode(message.mode);
      setClearVisible();
      const enabled = message.enabled !== false;
      queryInput.disabled = !enabled;
      includeInput.disabled = !enabled;
      excludeInput.disabled = !enabled;
      browseInclude.disabled = !enabled;
      browseExclude.disabled = !enabled;
      return;
    }
    if (message.type === 'tree') {
      const themeStyle = document.getElementById('fileIconTheme');
      if (themeStyle && typeof message.iconThemeCss === 'string') {
        themeStyle.textContent = message.iconThemeCss;
      }
      renderTree(message.nodes, message.emptyMessage, message.enabled !== false);
    }
  });

  setSettingsOpen(Boolean(readState().settingsOpen), false);
  post({ type: 'ready' });
})();
