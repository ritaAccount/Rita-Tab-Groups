(function () {
  const vscodeApi = acquireVsCodeApi();
  window.__tabGroupsVscode = vscodeApi;

  const navItems = Array.from(document.querySelectorAll('.nav-item[data-pane]'));
  const panes = Array.from(document.querySelectorAll('.settings-pane[data-pane]'));
  const generalStatusEl = document.getElementById('generalStatus');
  const displayStatusEl = document.getElementById('displayStatus');
  const versionDescEl = document.getElementById('versionDesc');
  const openGroupsButton = document.getElementById('openGroupsFile');
  const openConfigsButton = document.getElementById('openConfigsFile');
  const upgradeConfigButton = document.getElementById('upgradeConfig');
  const exportConfigButton = document.getElementById('exportConfig');
  const importConfigButton = document.getElementById('importConfig');
  const resetDisplayButton = document.getElementById('resetDisplay');
  const modeSelect = document.getElementById('markerJumpHintMode');
  const secondsInput = document.getElementById('markerJumpHintSeconds');
  const secondsRow = document.getElementById('markerJumpHintSecondsRow');
  const showSourceBranchInput = document.getElementById('showSourceBranch');
  const groupTypeDisplayModeSelect = document.getElementById('groupTypeDisplayMode');

  /** @type {{ markerJumpHintMode: string, markerJumpHintSeconds: number, showSourceBranch: boolean, groupTypeDisplayMode: string }} */
  let displaySettings = {
    markerJumpHintMode: 'always',
    markerJumpHintSeconds: 1,
    showSourceBranch: true,
    groupTypeDisplayMode: 'label',
  };

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimer;
  let suppressAutosave = false;

  function showPane(paneId) {
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.pane === paneId);
    });
    panes.forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === paneId);
    });
  }

  function setGeneralStatus(text) {
    if (generalStatusEl) {
      generalStatusEl.textContent = text || '';
    }
  }

  function setDisplayStatus(text) {
    if (displayStatusEl) {
      displayStatusEl.textContent = text || '';
    }
  }

  function renderVersionInfo(info) {
    if (!versionDescEl) {
      return;
    }
    const need = info.needsUpgrade ? '需要升级配置文件' : '配置已是最新';
    versionDescEl.textContent = `扩展 ${info.extensionVersion} · 配置 ${info.configVersion} · schema ${info.schemaVersion} · ${need}`;
    if (upgradeConfigButton) {
      upgradeConfigButton.textContent = info.needsUpgrade ? '升级配置' : '检查更新';
    }
  }

  function syncSecondsRow() {
    const mode =
      modeSelect instanceof HTMLSelectElement ? modeSelect.value : displaySettings.markerJumpHintMode;
    if (secondsRow) {
      secondsRow.hidden = mode !== 'timed';
    }
  }

  function readDisplayFromForm() {
    const mode =
      modeSelect instanceof HTMLSelectElement ? modeSelect.value : 'always';
    let seconds = Number(
      secondsInput instanceof HTMLInputElement ? secondsInput.value : 1,
    );
    if (!Number.isFinite(seconds) || seconds <= 0) {
      seconds = 1;
    }
    const showSourceBranch =
      showSourceBranchInput instanceof HTMLInputElement
        ? showSourceBranchInput.checked
        : true;
    const groupTypeDisplayMode =
      groupTypeDisplayModeSelect instanceof HTMLSelectElement
        ? groupTypeDisplayModeSelect.value
        : 'label';
    return {
      markerJumpHintMode: mode,
      markerJumpHintSeconds: seconds,
      showSourceBranch,
      groupTypeDisplayMode,
    };
  }

  function renderDisplaySettings(settings) {
    suppressAutosave = true;
    displaySettings = {
      markerJumpHintMode: settings.markerJumpHintMode || 'always',
      markerJumpHintSeconds:
        typeof settings.markerJumpHintSeconds === 'number'
          ? settings.markerJumpHintSeconds
          : 1,
      showSourceBranch:
        typeof settings.showSourceBranch === 'boolean' ? settings.showSourceBranch : true,
      groupTypeDisplayMode: settings.groupTypeDisplayMode || 'label',
    };

    if (modeSelect instanceof HTMLSelectElement) {
      modeSelect.value = displaySettings.markerJumpHintMode;
    }
    if (secondsInput instanceof HTMLInputElement) {
      secondsInput.value = String(displaySettings.markerJumpHintSeconds);
    }
    if (showSourceBranchInput instanceof HTMLInputElement) {
      showSourceBranchInput.checked = displaySettings.showSourceBranch;
    }
    if (groupTypeDisplayModeSelect instanceof HTMLSelectElement) {
      groupTypeDisplayModeSelect.value = displaySettings.groupTypeDisplayMode;
    }
    syncSecondsRow();
    suppressAutosave = false;
  }

  function queueAutosave(delayMs) {
    if (suppressAutosave) {
      return;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      vscodeApi.postMessage({ type: 'saveDisplay', display: readDisplayFromForm() });
    }, delayMs);
  }

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const paneId = item.dataset.pane;
      if (paneId) {
        showPane(paneId);
      }
    });
  });

  modeSelect?.addEventListener('change', () => {
    syncSecondsRow();
    queueAutosave(0);
  });

  secondsInput?.addEventListener('change', () => {
    queueAutosave(0);
  });

  secondsInput?.addEventListener('input', () => {
    queueAutosave(400);
  });

  showSourceBranchInput?.addEventListener('change', () => {
    queueAutosave(0);
  });

  groupTypeDisplayModeSelect?.addEventListener('change', () => {
    queueAutosave(0);
  });

  openGroupsButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openGroupsFile' });
  });

  openConfigsButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'openConfigsFile' });
  });

  upgradeConfigButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'upgradeConfig' });
  });

  exportConfigButton?.addEventListener('click', () => {
    setGeneralStatus('正在导出…');
    vscodeApi.postMessage({ type: 'exportConfig' });
  });

  importConfigButton?.addEventListener('click', () => {
    setGeneralStatus('正在导入…');
    vscodeApi.postMessage({ type: 'importConfig' });
  });

  resetDisplayButton?.addEventListener('click', () => {
    vscodeApi.postMessage({ type: 'resetDisplay' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'generalStatus') {
      setGeneralStatus(message.text || '');
      return;
    }
    if (message.type === 'versionInfo') {
      renderVersionInfo(message);
      return;
    }
    if (message.type === 'displayInit') {
      renderDisplaySettings(message.display || {});
      setDisplayStatus('');
      return;
    }
    if (message.type === 'displaySaved') {
      renderDisplaySettings(message.display || {});
      setDisplayStatus(message.text || '已保存');
      return;
    }
    if (message.type === 'displayStatus') {
      setDisplayStatus(message.text || '');
    }
  });
})();
