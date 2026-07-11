const $ = (id) => document.getElementById(id);

const urlInput = $('urlInput');
const fileInput = $('fileInput');
const fileInput2 = $('fileInput2');
const linkList = $('linkList');
const addLinkBtn = $('addLinkBtn');
const batchPreview = $('batchPreview');
const batchItems = $('batchItems');
const batchCount = $('batchCount');
const batchResultList = $('batchResultList');
const dropZone = $('dropZone');
const cover = $('cover');
const title = $('title');
const badge = $('badge');
const note = $('note');
const speed = $('speed');
const gain = $('gain');
const speedValue = $('speedValue');
const gainValue = $('gainValue');
const speedChip = $('speedChip');
const gainChip = $('gainChip');
const robloxValue = $('robloxValue');
const alertBox = $('alert');
const result = $('result');
const convertBtn = $('convertBtn');
const normalize = $('normalize');
const qualityMax = $('qualityMax');
const cleanMaster = $('cleanMaster');
const uploadStatus = $('uploadStatus');
const uploadRobloxBtn = $('uploadRobloxBtn');
const uploadAllBtn = $('uploadAllBtn');
const partsList = $('partsList');
const shareWithInput = $('shareWith');
const robloxApiKeyInput = $('robloxApiKeyInput');
const robloxCreatorIdInput = $('robloxCreatorIdInput');
const robloxCreatorTypeSelect = $('robloxCreatorTypeSelect');
const robloxUploadUrlInput = $('robloxUploadUrlInput');
const robloxPermissionUrlInput = $('robloxPermissionUrlInput');
const saveRobloxSettingsBtn = $('saveRobloxSettingsBtn');
const robloxSettingsStatus = $('robloxSettingsStatus');

let pickedFiles = [];
let pickedFile = null;
let batchLinkStates = {};
let batchLinkCounter = 0;
let currentMeta = { title: 'audio' };
let lastConvertedFileName = null;
let lastConvertedFiles = [];
let metadataFetchToken = 0;
let metadataLoadingUrl = null;
let metadataDebounceTimer = null;

// hide Upload All by default
if (uploadAllBtn) uploadAllBtn.style.display = 'none';

const LOCAL_STORAGE_ROBLOX_KEY = 'robloxSettings';

function getLocalRobloxSettings() {
  if (!robloxApiKeyInput || !robloxCreatorIdInput || !robloxCreatorTypeSelect || !robloxUploadUrlInput || !robloxPermissionUrlInput) {
    return {
      apiKey: '',
      creatorId: '',
      creatorType: 'user',
      uploadUrl: 'https://apis.roblox.com/assets/v1/assets',
      setPermissionUrl: ''
    };
  }

  return {
    apiKey: String(robloxApiKeyInput.value || '').trim(),
    creatorId: String(robloxCreatorIdInput.value || '').trim(),
    creatorType: String(robloxCreatorTypeSelect.value || 'user').trim(),
    uploadUrl: String(robloxUploadUrlInput.value || '').trim() || 'https://apis.roblox.com/assets/v1/assets',
    setPermissionUrl: String(robloxPermissionUrlInput.value || '').trim()
  };
}

function loadRobloxSettingsFromLocalStorage() {
  if (!robloxApiKeyInput || !robloxCreatorIdInput || !robloxCreatorTypeSelect || !robloxUploadUrlInput || !robloxPermissionUrlInput) return;

  let stored = {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_ROBLOX_KEY);
    stored = raw ? JSON.parse(raw) : {};
  } catch (_) {
    stored = {};
  }

  robloxApiKeyInput.value = stored.apiKey || '';
  robloxCreatorIdInput.value = stored.creatorId || '';
  robloxCreatorTypeSelect.value = stored.creatorType || 'user';
  robloxUploadUrlInput.value = stored.uploadUrl || 'https://apis.roblox.com/assets/v1/assets';
  robloxPermissionUrlInput.value = stored.setPermissionUrl || '';
}

function saveRobloxSettingsToLocalStorage() {
  if (!robloxApiKeyInput || !robloxCreatorIdInput || !robloxCreatorTypeSelect || !robloxUploadUrlInput || !robloxPermissionUrlInput || !robloxSettingsStatus) return;
  robloxSettingsStatus.textContent = 'Menyimpan...';
  try {
    const settings = getLocalRobloxSettings();
    window.localStorage.setItem(LOCAL_STORAGE_ROBLOX_KEY, JSON.stringify(settings));
    robloxSettingsStatus.textContent = 'Tersimpan. Bisa diubah lagi kapan saja.';
    showAlert('Settings Roblox tersimpan secara lokal di perangkat ini.', true);
  } catch (err) {
    robloxSettingsStatus.textContent = err.message;
    showAlert(err.message);
  }
}

function showAlert(message, ok = false) {
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
  alertBox.style.borderColor = ok ? 'rgba(0,209,117,.35)' : 'rgba(255,45,53,.32)';
  alertBox.style.background = ok ? 'rgba(0,209,117,.12)' : 'rgba(255,45,53,.12)';
  alertBox.style.color = ok ? '#00d175' : '#ff4b56';
}

function hideAlert() { alertBox.classList.add('hidden'); }

function getFallbackTitle(value = '', fallback = 'audio') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw);
    const slug = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const cleaned = decodeURIComponent(slug || parsed.hostname || fallback)
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  } catch (_) {
    const cleaned = raw
      .split(/[/?#]/)
      .filter(Boolean)
      .pop() || '';
    return cleaned.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
  }
}

function getSuggestedTitle() {
  if (pickedFiles.length) {
    const first = pickedFiles[0];
    if (first?.name) return first.name.replace(/\.[^.]+$/, '');
  }

  if (pickedFile?.name) {
    return pickedFile.name.replace(/\.[^.]+$/, '');
  }

  const url = (urlInput?.value || '').trim();
  if (url) {
    const fallbackUrlTitle = getFallbackTitle(url);
    return currentMeta?.title && String(currentMeta.title).trim() && String(currentMeta.title).toLowerCase() !== 'audio'
      ? String(currentMeta.title).trim()
      : fallbackUrlTitle;
  }

  return currentMeta?.title && String(currentMeta.title).trim() && String(currentMeta.title).toLowerCase() !== 'audio'
    ? String(currentMeta.title).trim()
    : 'audio';
}

function resetUploadStatus() {
  uploadStatus.textContent = '';
}

function createLinkRow(value = '') {
  const row = document.createElement('div');
  row.className = 'linkRow';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'batchLinkInput';
  input.placeholder = 'https://youtube.com/watch?v=...';
  input.value = value;
  row.dataset.linkId = `batch-${batchLinkCounter++}`;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'removeLinkBtn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    delete batchLinkStates[row.dataset.linkId];
    row.remove();
    renderBatchPreview();
  });

  const queueMetadata = () => {
    const link = input.value.trim();
    if (!link) return;
    urlInput.value = '';
    currentMeta = { title: 'audio' };
    const state = batchLinkStates[row.dataset.linkId] || {};
    if (state.loaded || state.loading) return;
    batchLinkStates[row.dataset.linkId] = { loading: true, title: '', duration: null, provider: '', error: null };
    renderBatchPreview();
    fetchBatchLinkMetadata(link, row.dataset.linkId);
  };

  input.addEventListener('input', queueMetadata);
  input.addEventListener('change', queueMetadata);
  input.addEventListener('blur', queueMetadata);

  if (value.trim()) {
    queueMetadata();
  }

  row.append(input, removeBtn);
  return row;
}

function addLinkRow(value = '') {
  if (!linkList) return;
  linkList.appendChild(createLinkRow(value));
  renderBatchPreview();
  loadAllBatchMetadata();
}

function getBatchLinks() {
  return Array.from(document.querySelectorAll('.batchLinkInput'))
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function formatMinutes(seconds) {
  if (!seconds || Number.isNaN(Number(seconds))) return '??:??';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

async function fetchBatchLinkMetadata(url, linkId) {
  const state = batchLinkStates[linkId] || {};
  if (state.loaded || state.loading) return;

  try {
    const res = await fetch('/api/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    batchLinkStates[linkId] = {
      loaded: true,
      loading: false,
      title: data.title || url,
      duration: data.duration || null,
      provider: data.provider || 'URL',
      error: data.error || null
    };
  } catch (err) {
    batchLinkStates[linkId] = {
      loaded: true,
      loading: false,
      title: url,
      duration: null,
      provider: 'URL',
      error: err.message || 'Metadata gagal'
    };
  }
  renderBatchPreview();
}

function loadAllBatchMetadata() {
  const rows = Array.from(document.querySelectorAll('.linkRow'));
  rows.forEach((row) => {
    const link = row.querySelector('.batchLinkInput')?.value.trim();
    const linkId = row.dataset.linkId;
    if (!link || !linkId) return;
    const state = batchLinkStates[linkId] || {};
    if (!state.loaded && !state.loading && !state.error) {
      batchLinkStates[linkId] = { loading: true, title: '', duration: null, provider: '', error: null };
      fetchBatchLinkMetadata(link, linkId);
    }
  });
}

function renderBatchPreview() {
  const links = getBatchLinks();
  const files = pickedFiles || [];
  const hasLinks = links.length > 0;
  const hasFiles = files.length > 0;

  if (!batchPreview || !batchItems || !batchCount) return;
  batchItems.innerHTML = '';

  if (!hasLinks && !hasFiles) {
    batchPreview.classList.add('hidden');
    return;
  }

  batchPreview.classList.remove('hidden');
  if (hasLinks) {
    batchCount.textContent = `${links.length} links`;
    loadAllBatchMetadata();
    const rows = Array.from(document.querySelectorAll('.linkRow'));
    rows.forEach((row, idx) => {
      const link = row.querySelector('.batchLinkInput')?.value.trim();
      if (!link) return;
      const linkId = row.dataset.linkId;
      const state = batchLinkStates[linkId] || {};
      const item = document.createElement('div');
      item.className = 'batchItem';

          if (!state.loaded && !state.error && !state.loading) {
        batchLinkStates[linkId] = { loading: true, title: '', duration: null, provider: '', error: null };
        fetchBatchLinkMetadata(link, linkId);
      }

      const text = document.createElement('div');
      text.className = 'batchItemText';
      const status = document.createElement('div');
      status.className = 'batchItemStatus';

      if (state.loading) {
        text.textContent = `${idx + 1}. ${link}`;
        status.textContent = 'LOADING...';
      } else if (state.error) {
        text.textContent = `${idx + 1}. ${link}`;
        status.textContent = `TIDAK BISA: ${state.error}`;
        item.classList.add('batchItemError');
      } else if (state.title) {
        const durationLabel = state.duration ? ` • ${formatMinutes(state.duration)} menit` : '';
        text.textContent = `${idx + 1}. ${state.title}${durationLabel} • ${state.provider}`;
        status.textContent = 'BISA';
        item.classList.add('batchItemReady');
      } else {
        text.textContent = `${idx + 1}. ${link}`;
        status.textContent = 'BISA';
      }

      item.append(text, status);
      batchItems.appendChild(item);
    });
  } else {
    batchCount.textContent = `${files.length} files`;
    files.forEach((file, idx) => {
      const item = document.createElement('div');
      item.className = 'batchItem';
      const text = document.createElement('div');
      text.className = 'batchItemText';
      text.textContent = `${idx + 1}. ${file.name} • ${Math.max(0, (file.size / 1024 / 1024).toFixed(2))} MB`;
      const status = document.createElement('div');
      status.className = 'batchItemStatus';
      status.textContent = 'BISA';
      item.append(text, status);
      batchItems.appendChild(item);
    });
  }
}

function renderBatchResult(results) {
  if (!batchResultList) return;
  batchResultList.innerHTML = '';
  if (!results || !results.length) {
    batchResultList.classList.add('hidden');
    return;
  }

  batchResultList.classList.remove('hidden');
  results.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'batchResultRow';

    const main = document.createElement('div');
    main.className = 'batchResultTitle';
    const titleText = item.title || item.url || item.fileName || 'Item';
    const duration = item.durationSec ? ` • ${formatMinutes(item.durationSec)} menit` : '';
    main.textContent = `${idx + 1}. ${titleText}${duration}`;

    const status = document.createElement('div');
    status.textContent = item.ok === false ? `ERROR: ${item.error || 'Gagal'}` : `SUKSES: ${item.fileName || item.url || 'output tersedia'}`;
    status.className = item.ok === false ? 'batchResultError' : 'batchResultSuccess';

    row.append(main, status);
    batchResultList.appendChild(row);
  });
}

function selectFiles(files) {
  pickedFiles = Array.from(files || []);
  pickedFile = pickedFiles.length === 1 ? pickedFiles[0] : null;
  lastConvertedFileName = null;
  if (!pickedFiles.length) return;

  resetUploadStatus();
  urlInput.value = '';
  linkList.querySelectorAll('.batchLinkInput').forEach((input) => (input.value = ''));

  const fileNames = pickedFiles.map((file) => file.name).join(', ');
  currentMeta = { title: pickedFiles.length === 1 ? pickedFiles[0].name.replace(/\.[^.]+$/, '') : `${pickedFiles.length} files` };
  title.textContent = currentMeta.title;
  badge.textContent = pickedFiles.length === 1 ? 'UPLOAD FILE' : 'UPLOAD FILES';
  note.textContent = `${pickedFiles.length} file siap dikonversi. Klik CONVERTER.`;
  cover.src = '/placeholder.svg';
  hideAlert();
  renderBatchPreview();
}

function calcRobloxPlaybackSpeed() {
  return (1 / Number(speed.value || 1)).toFixed(4);
}

function syncSliders() {
  speedValue.textContent = `${Number(speed.value).toFixed(2).replace(/\.00$/, '')}x`;
  gainValue.textContent = `${Number(gain.value)}dB`;
  speedChip.textContent = speedValue.textContent;
  gainChip.textContent = gainValue.textContent;
  robloxValue.textContent = calcRobloxPlaybackSpeed();
}

speed.addEventListener('input', syncSliders);
gain.addEventListener('input', syncSliders);
syncSliders();
loadRobloxSettingsFromLocalStorage();

if (addLinkBtn) {
  addLinkBtn.addEventListener('click', () => addLinkRow());
}
addLinkRow();

document.querySelectorAll('input[name="pitchMode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.optionCard').forEach(card => card.classList.remove('active'));
    radio.closest('.optionCard').classList.add('active');
  });
});

$('toggleAdv').addEventListener('click', () => $('advBody').classList.toggle('hidden'));
$('clearBtn').addEventListener('click', () => {
  urlInput.value = '';
  pickedFiles = [];
  lastConvertedFileName = null;
  fileInput.value = '';
  fileInput2.value = '';
  batchLinkStates = {};
  currentMeta = { title: 'audio' };
  linkList.innerHTML = '';
  addLinkRow();
  renderBatchPreview();
  cover.src = '/placeholder.svg';
  title.textContent = 'Audio Converter';
  badge.textContent = 'READY';
  note.textContent = 'Paste link YouTube/direct audio atau upload file, lalu convert ke .ogg.';
  hideAlert();
  resetUploadStatus();
  uploadRobloxBtn.textContent = '⇧ UPLOAD';
});

$('pasteBtn').addEventListener('click', async () => {
  try {
    urlInput.value = await navigator.clipboard.readText();
    await loadMetadata();
  } catch (_) {
    showAlert('BROWSER TIDAK MENGIZINKAN CLIPBOARD');
  }
});

// --- Tab UI controller ---
function showTab(name) {
  const convertSections = ['hero', 'dropZone', 'preview', 'advBody', 'batchPreview'];
  // mapping: Convert shows hero, dropZone, preview, advanced; Batch shows batchPreview; Results shows result
  const elMap = {
    Convert: ['hero','dropZone','preview','advBody'],
    'Batch Review': ['batchPreview'],
    Results: ['result']
  };

  // hide/show sections
  const allSections = ['hero','dropZone','preview','advBody','batchPreview','result'];
  allSections.forEach(id => {
    const el = document.querySelector(`.${id}`) || document.getElementById(id);
    if (!el) return;
    const shouldShow = (elMap[name] || []).includes(id);
    if (shouldShow) el.classList.remove('tabContentHidden'); else el.classList.add('tabContentHidden');
  });

  // update tab buttons
  document.querySelectorAll('.tabButton').forEach(btn => {
    const active = (btn.textContent === name);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

const tabConvert = document.getElementById('tabConvert');
const tabBatch = document.getElementById('tabBatch');
const tabResults = document.getElementById('tabResults');
if (tabConvert) tabConvert.addEventListener('click', () => showTab('Convert'));
if (tabBatch) tabBatch.addEventListener('click', () => showTab('Batch Review'));
if (tabResults) tabResults.addEventListener('click', () => showTab('Results'));

// initialize: show Convert tab by default
showTab('Convert');

urlInput.addEventListener('input', () => {
  if (urlInput.value.trim()) {
    linkList.querySelectorAll('.batchLinkInput').forEach(input => input.value = '');
    batchLinkStates = {};
    renderBatchPreview();
  }

  clearTimeout(metadataDebounceTimer);
  metadataDebounceTimer = setTimeout(() => loadMetadata(), 300);
});

function selectFile(file) {
  pickedFile = file || null;
  lastConvertedFileName = null;
  if (!pickedFile) return;
  resetUploadStatus();
  urlInput.value = '';
  currentMeta = { title: pickedFile.name.replace(/\.[^.]+$/, '') };
  title.textContent = currentMeta.title;
  badge.textContent = 'UPLOAD FILE';
  note.textContent = `${pickedFile.name} • ${(pickedFile.size / 1024 / 1024).toFixed(2)} MB siap dikonversi ke OGG.`;
  cover.src = '/placeholder.svg';
  hideAlert();
}

fileInput.addEventListener('change', () => selectFiles(fileInput.files));
fileInput2.addEventListener('change', () => selectFiles(fileInput2.files));

['dragenter', 'dragover'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
});

['dragleave', 'drop'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
  });
});

dropZone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  selectFiles(files);
});

async function loadMetadata(force = false) {
  lastConvertedFileName = null;
  resetUploadStatus();
  const url = urlInput.value.trim();
  if (!url || pickedFiles.length) return;
  if (!force && (metadataLoadingUrl === url || (currentMeta?.sourceUrl === url && currentMeta?.loaded))) return;

  hideAlert();
  badge.textContent = 'LOADING';
  note.textContent = 'Membaca metadata...';

  const requestId = ++metadataFetchToken;
  metadataLoadingUrl = url;

  try {
    const res = await fetch('/api/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Metadata gagal dibaca.');

    const fallbackTitle = getFallbackTitle(url);
    const resolvedTitle = (data.title && String(data.title).trim() && String(data.title).toLowerCase() !== 'audio')
      ? String(data.title).trim()
      : fallbackTitle;

    if (requestId !== metadataFetchToken) return;

    currentMeta = { ...data, sourceUrl: url, loaded: true, title: resolvedTitle };
    title.textContent = currentMeta.title || 'Audio';
    badge.textContent = currentMeta.provider || 'URL';
    note.textContent = currentMeta.note || (currentMeta.duration ? `Duration: ${currentMeta.duration}s` : 'Siap dikonversi ke OGG.');
    cover.src = currentMeta.thumbnail || '/placeholder.svg';
  } catch (err) {
    if (requestId !== metadataFetchToken) return;

    const fallbackTitle = getFallbackTitle(url);
    currentMeta = {
      ...currentMeta,
      sourceUrl: url,
      loaded: false,
      title: currentMeta?.title && String(currentMeta.title).trim() && String(currentMeta.title).toLowerCase() !== 'audio'
        ? String(currentMeta.title).trim()
        : fallbackTitle
    };
    title.textContent = currentMeta.title || 'Audio';
    badge.textContent = 'ERROR';
    note.textContent = 'Metadata gagal dibaca, tapi kamu masih bisa coba convert.';
    showAlert(err.message);
  } finally {
    if (requestId === metadataFetchToken) {
      metadataLoadingUrl = null;
    }
  }
}

convertBtn.addEventListener('click', async () => {
  hideAlert();
  result.classList.add('hidden');
  const url = urlInput.value.trim();
  const batchLinks = getBatchLinks();
  const selectedFiles = pickedFiles || [];

  if (!url && !selectedFiles.length && !batchLinks.length) {
    return showAlert('MASUKKAN LINK ATAU UPLOAD FILE DULU');
  }

  if (url && batchLinks.length) {
    return showAlert('Pilih URL tunggal di atas, atau gunakan daftar link di bawah, bukan keduanya.');
  }

  if (selectedFiles.length && (url || batchLinks.length)) {
    return showAlert('Pilih file saja atau link saja, jangan keduanya.');
  }

  const form = new FormData();
  form.append('speed', speed.value);
  form.append('gainDb', gain.value);
  form.append('pitchMode', document.querySelector('input[name="pitchMode"]:checked')?.value || 'chipmunk');
  form.append('normalize', normalize.checked ? 'on' : 'off');
  form.append('quality', qualityMax.checked ? 'max' : 'standard');
  form.append('cleanMaster', cleanMaster.checked ? 'on' : 'off');
  form.append('title', getSuggestedTitle());

  let isBatchRequest = false;
  let requestOptions = { method: 'POST' };

  if (selectedFiles.length) {
    selectedFiles.forEach((file) => form.append('files', file));
    form.append('robloxSettings', JSON.stringify(getLocalRobloxSettings()));
    requestOptions.body = form;
  } else if (batchLinks.length > 0) {
    loadAllBatchMetadata();
    isBatchRequest = true;
    const payload = {
      items: batchLinks.map((link) => ({ url: link })),
      robloxSettings: getLocalRobloxSettings()
    };
    payload.speed = speed.value;
    payload.gainDb = gain.value;
    payload.pitchMode = document.querySelector('input[name="pitchMode"]:checked')?.value || 'chipmunk';
    payload.normalize = normalize.checked ? 'on' : 'off';
    payload.quality = qualityMax.checked ? 'max' : 'standard';
    payload.cleanMaster = cleanMaster.checked ? 'on' : 'off';
    payload.title = getSuggestedTitle();
    requestOptions.headers = { 'Content-Type': 'application/json' };
    requestOptions.body = JSON.stringify(payload);
  } else {
    form.append('url', url);
    form.append('robloxSettings', JSON.stringify(getLocalRobloxSettings()));
    requestOptions.body = form;
  }

  convertBtn.disabled = true;
  convertBtn.textContent = 'PROCESSING...';

  try {
    const res = await fetch('/api/convert', requestOptions);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Convert gagal.');

    let firstResult = data;
    let batchFiles = [];
    if (data.results && data.results.length) {
      firstResult = data.results[0];
      $('jobId').textContent = `BATCH ${data.count || data.results.length} items`;
      $('resultTitle').textContent = `${data.count || data.results.length} item dikonversi`;
      renderBatchResult(data.results);
      showAlert(`BATCH KONVERSI ${data.count || data.results.length} ITEM SELESAI`, true);
      batchFiles = data.results.flatMap(result => {
        if (result.fileList && result.fileList.length) {
          return result.fileList.map((p) => ({ ...p, taskTitle: result.title || '' }));
        }
        return [{ fileName: result.fileName, url: result.url, size: result.size || 0, taskTitle: result.title || '' }];
      });
    } else {
      $('jobId').textContent = `JOB ID: ${data.jobId}`;
      $('resultTitle').textContent = data.title;
      renderBatchResult([]);
      showAlert('CONVERT SUCCESS', true);
      batchFiles = firstResult.fileList || [{ fileName: firstResult.fileName, url: firstResult.url, size: firstResult.size || 0, taskTitle: firstResult.title || '' }];
    }

    const fileUrl = firstResult.url || (firstResult.fileList && firstResult.fileList[0] && firstResult.fileList[0].url);
    const fileName = firstResult.fileName || (firstResult.fileList && firstResult.fileList[0] && firstResult.fileList[0].fileName);

    $('fileName').textContent = fileName || 'audio.ogg';
    $('player').src = fileUrl || '';
    $('saveBtn').href = fileUrl || '#';
    $('saveBtn').download = fileName || '';
    $('finalSpeed').textContent = (firstResult.robloxPlaybackSpeed || data.robloxPlaybackSpeed || calcRobloxPlaybackSpeed()).toFixed(4);
    lastConvertedFileName = fileName || null;
    lastConvertedFiles = batchFiles;
    renderPartsList(lastConvertedFiles);
    result.classList.remove('hidden');
  } catch (err) {
    showAlert(err.message);
  } finally {
    convertBtn.disabled = false;
    convertBtn.textContent = '⬇ CONVERTER';
  }
});

$('resetBtn').addEventListener('click', () => location.reload());
$('copySpeed').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('finalSpeed').textContent);
  showAlert('PLAYBACKSPEED COPIED', true);
});

if (saveRobloxSettingsBtn) {
  saveRobloxSettingsBtn.addEventListener('click', saveRobloxSettingsToLocalStorage);
}

$('uploadRobloxBtn').addEventListener('click', async () => {
  hideAlert();
  resetUploadStatus();
  uploadRobloxBtn.disabled = true;
  uploadRobloxBtn.textContent = 'UPLOADING...';
  uploadStatus.textContent = 'Uploading to Roblox...';

  const form = new FormData();
  let isDirectOggUpload = false;

  if (pickedFile && pickedFile.name.toLowerCase().endsWith('.ogg')) {
    form.append('file', pickedFile);
    form.append('title', getSuggestedTitle());
    form.append('robloxSettings', JSON.stringify(getLocalRobloxSettings()));
    isDirectOggUpload = true;
  }

  let res;
  try {
    if (isDirectOggUpload) {
      res = await fetch('/api/upload-roblox', { method: 'POST', body: form });
    } else if (lastConvertedFileName && (!lastConvertedFiles || lastConvertedFiles.length <= 1)) {
      const payload = {
        fileName: lastConvertedFileName,
        title: currentMeta.title || 'audio',
        robloxSettings: getLocalRobloxSettings()
      };
      res = await fetch('/api/upload-roblox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else if (lastConvertedFiles && lastConvertedFiles.length > 1) {
      // for multi-part, prefer Upload All button; here just notify
      uploadStatus.textContent = 'Terdapat beberapa part. Gunakan tombol Upload All.';
      uploadRobloxBtn.disabled = false;
      uploadRobloxBtn.textContent = '⇧ UPLOAD';
      return;
    } else {
      return showAlert('Kirim file .ogg langsung, atau convert audio dulu untuk mendapatkan fileName.');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload gagal.');

    uploadStatus.textContent = `Upload sukses: ${data.title}`;
    uploadRobloxBtn.textContent = 'UPLOAD SUCCESS';
    showAlert(`Upload sukses: ${data.title}`, true);
  } catch (err) {
    uploadRobloxBtn.textContent = '⇧ UPLOAD';
    showAlert(err.message);
  } finally {
    uploadRobloxBtn.disabled = false;
  }
});

function renderPartsList(parts) {
  partsList.innerHTML = '';
  if (!parts || !parts.length) {
    if (uploadAllBtn) uploadAllBtn.style.display = 'none';
    return;
  }
  // show Upload All only when more than one part
  if (uploadAllBtn) uploadAllBtn.style.display = parts.length > 1 ? 'inline-block' : 'none';
  parts.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'partRow';
    row.setAttribute('data-file', p.fileName);

    const name = document.createElement('div');
    name.className = 'partName';
    name.textContent = p.fileName;
    name.style.cursor = 'pointer';
    name.title = 'Click to preview this part';
    name.addEventListener('click', () => {
      // play this part
      const player = $('player');
      player.src = p.url;
      player.play().catch(() => {});
      // update main filename display
      $('fileName').textContent = p.fileName;
      // highlight selected
      partsList.querySelectorAll('.partRow').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
    });

    const actions = document.createElement('div');
    actions.className = 'partActions';

    const save = document.createElement('a');
    save.className = 'save small';
    save.href = p.url;
    save.download = p.fileName;
    save.textContent = '⬇ SAVE';

    const up = document.createElement('button');
    up.className = 'upload small';
    up.textContent = '⇧ UPLOAD';
    up.addEventListener('click', () => {
      // set status
      const statusEl = row.querySelector('.partStatus');
      if (statusEl) statusEl.textContent = 'Uploading...';
      up.disabled = true;
      up.textContent = 'UPLOADING...';
      uploadPart(p.fileName, up);
    });

    const status = document.createElement('div');
    status.className = 'partStatus';
    status.textContent = 'Pending';

    actions.appendChild(save);
    actions.appendChild(up);
    actions.appendChild(status);

    row.appendChild(name);
    row.appendChild(actions);
    partsList.appendChild(row);
  });
}

async function uploadPart(fileName, btn) {
  try {
    btn.disabled = true;
    const titleForPart = fileName.replace(/\.ogg$/i, '');
    // collect shareWith value (support comma-separated list)
    const raw = shareWithInput?.value?.trim();
    const shareWithIds = raw ? raw.split(/[,\s]+/).filter(Boolean) : null;
    const body = { fileName, title: titleForPart, robloxSettings: getLocalRobloxSettings() };
    if (shareWithIds && shareWithIds.length) body.shareWithIds = shareWithIds;

    const res = await fetch('/api/upload-roblox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload gagal');
    btn.textContent = 'OK';
    uploadStatus.textContent = `Upload sukses: ${data.title || data.fileName}`;
    const row = btn.closest('.partRow');
    if (row) row.querySelector('.partStatus').textContent = 'Uploaded';
    // show permission results if present
    if (data.permissions) {
      const permEl = document.createElement('div');
      permEl.className = 'permStatus';
      if (data.permissions.batch) {
        permEl.textContent = `Permissions: batch result`;
      } else if (Array.isArray(data.permissions.results)) {
        const ok = data.permissions.results.filter(r => r.ok).length;
        permEl.textContent = `Permissions: ${ok}/${data.permissions.results.length} granted`;
      } else if (data.permissions.results) {
        permEl.textContent = `Permissions: ${JSON.stringify(data.permissions.results)}`;
      }
      if (row) row.querySelector('.partActions').appendChild(permEl);
    }
    showAlert(`Upload sukses: ${data.title || data.fileName}`, true);
  } catch (err) {
    showAlert(err.message);
    btn.disabled = false;
    btn.textContent = '⇧ UPLOAD';
  }
}

$('uploadAllBtn').addEventListener('click', async () => {
  if (!lastConvertedFiles || !lastConvertedFiles.length) return showAlert('Tidak ada part untuk diupload.');
  uploadAllBtn.disabled = true;
  uploadAllBtn.textContent = 'UPLOADING...';
  uploadStatus.textContent = 'Uploading all parts...';

  try {
    const fileNames = lastConvertedFiles.map(p => p.fileName);
    const raw = shareWithInput?.value?.trim();
    const shareWithIds = raw ? raw.split(/[,\s]+/).filter(Boolean) : null;
    const payload = { fileNames, robloxSettings: getLocalRobloxSettings() };
    if (shareWithIds && shareWithIds.length) payload.shareWithIds = shareWithIds;

    const res = await fetch('/api/upload-roblox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Batch upload gagal');
    if (data.batch) {
      // update UI per-part
      let okCount = 0;
      data.batch.forEach(b => {
        const row = partsList.querySelector(`[data-file="${b.fileName}"]`);
        if (row) {
          const statusEl = row.querySelector('.partStatus');
          const btn = row.querySelector('button.upload');
          if (b.ok) {
            okCount += 1;
            statusEl.textContent = 'Uploaded';
            if (btn) btn.textContent = 'OK';
            // show permission result if present
            if (b.permissions) {
              const permEl = document.createElement('div');
              permEl.className = 'permStatus';
              if (b.permissions.batch) permEl.textContent = 'Permissions: batch result';
              else if (Array.isArray(b.permissions.results)) {
                const ok = b.permissions.results.filter(r => r.ok).length;
                permEl.textContent = `Permissions: ${ok}/${b.permissions.results.length} granted`;
              } else permEl.textContent = 'Permissions: unknown';
              row.querySelector('.partActions').appendChild(permEl);
            }
          } else {
            statusEl.textContent = `Error: ${b.error || 'failed'}`;
            if (btn) { btn.textContent = 'Retry'; btn.disabled = false; }
          }
        }
      });

      uploadStatus.textContent = `Upload selesai: ${okCount}/${data.batch.length} sukses`;
      showAlert(`Upload selesai: ${okCount}/${data.batch.length} sukses`, true);
    } else {
      uploadStatus.textContent = 'Upload selesai';
      showAlert('Upload selesai', true);
    }
  } catch (err) {
    showAlert(err.message);
  } finally {
    uploadAllBtn.disabled = false;
    uploadAllBtn.textContent = '⇧ UPLOAD ALL';
  }
});
