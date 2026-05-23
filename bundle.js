/* ===== crop-selector.js ===== */
/**
 * crop-selector.js — Draggable, resizable scan-area box on the camera viewport.
 * Controls which portion of the video frame captureFrame() will crop and send to OCR.
 * Selection is stored as fractions (0-1) of the camera viewport dimensions.
 */
const CropSelector = (() => {
  const MIN_W = 0.12, MIN_H = 0.08;

  function _defaultSel() {
    // On portrait mobile: wider, shorter box to match keg label aspect ratio
    const narrow = window.innerWidth <= 768 && window.innerWidth < window.innerHeight;
    return narrow
      ? { left: 0.05, top: 0.35, width: 0.90, height: 0.28 }
      : { left: 0.175, top: 0.25, width: 0.65, height: 0.50 };
  }

  let sel = _defaultSel();
  let guideEl = null;
  let vpEl = null;
  let dragging = null;   // null | 'move' | 'tl' | 'tr' | 'bl' | 'br'
  let startPtr = null;   // { x, y, sel } at drag start
  let dblTapTimer = null;

  function init() {
    guideEl = document.getElementById('scan-guide');
    vpEl = document.getElementById('camera-viewport');
    _render();
    _bindEvents();
  }

  function _render() {
    Object.assign(guideEl.style, {
      left:      (sel.left  * 100).toFixed(2) + '%',
      top:       (sel.top   * 100).toFixed(2) + '%',
      width:     (sel.width * 100).toFixed(2) + '%',
      height:    (sel.height* 100).toFixed(2) + '%',
      transform: 'none',  // override the CSS centering transform
      right:     'auto',
      bottom:    'auto',
    });
  }

  function _getPtr(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function _onDown(e) {
    // Detect double-tap / double-click → reset
    if (dblTapTimer) {
      clearTimeout(dblTapTimer);
      dblTapTimer = null;
      reset();
      return;
    }
    dblTapTimer = setTimeout(() => { dblTapTimer = null; }, 300);

    const handle = e.target.closest('[data-handle]');
    dragging = handle ? handle.dataset.handle : 'move';
    const ptr = _getPtr(e);
    startPtr = { x: ptr.x, y: ptr.y, sel: { ...sel } };
    e.preventDefault();
    e.stopPropagation();
  }

  function _onMove(e) {
    if (!dragging || !startPtr) return;
    e.preventDefault();
    const ptr = _getPtr(e);
    const rect = vpEl.getBoundingClientRect();
    const dx = (ptr.x - startPtr.x) / rect.width;
    const dy = (ptr.y - startPtr.y) / rect.height;
    const s  = startPtr.sel;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    if (dragging === 'move') {
      sel.left = clamp(s.left + dx, 0, 1 - s.width);
      sel.top  = clamp(s.top  + dy, 0, 1 - s.height);
    } else if (dragging === 'tl') {
      const nl = clamp(s.left + dx, 0, s.left + s.width  - MIN_W);
      const nt = clamp(s.top  + dy, 0, s.top  + s.height - MIN_H);
      sel.width  = s.left + s.width  - nl;
      sel.height = s.top  + s.height - nt;
      sel.left = nl; sel.top = nt;
    } else if (dragging === 'tr') {
      const nt = clamp(s.top + dy, 0, s.top + s.height - MIN_H);
      sel.width  = clamp(s.width  + dx, MIN_W, 1 - s.left);
      sel.height = s.top + s.height - nt;
      sel.top = nt;
    } else if (dragging === 'bl') {
      const nl = clamp(s.left + dx, 0, s.left + s.width - MIN_W);
      sel.width  = s.left + s.width - nl;
      sel.height = clamp(s.height + dy, MIN_H, 1 - s.top);
      sel.left = nl;
    } else if (dragging === 'br') {
      sel.width  = clamp(s.width  + dx, MIN_W, 1 - s.left);
      sel.height = clamp(s.height + dy, MIN_H, 1 - s.top);
    }

    _render();
  }

  function _onUp() { dragging = null; startPtr = null; }

  function _bindEvents() {
    guideEl.addEventListener('mousedown',  _onDown);
    document.addEventListener('mousemove', _onMove);
    document.addEventListener('mouseup',   _onUp);
    guideEl.addEventListener('touchstart', _onDown, { passive: false });
    document.addEventListener('touchmove', _onMove, { passive: false });
    document.addEventListener('touchend',  _onUp);
  }

  function reset() {
    sel = _defaultSel();
    _render();
  }

  function getSelection() { return { ...sel }; }

  return { init, reset, getSelection };
})();


/* ===== store.js ===== */
/**
 * store.js - LocalStorage-based state management
 */
const Store = (() => {
  const KEYS = {
    shipTo:       'keg_shipto_list',
    kegSize:      'keg_kegsize_list',
    brand:        'keg_brand_list',
    apiKey:        'keg_gemini_apikey',
    geminiEndpoint:'keg_gemini_endpoint',
    openaiKey:     'keg_openai_apikey',
    gcvKey:        'keg_gcv_apikey',
    vercelUrl:     'keg_vercel_url',
    azureEndpoint: 'keg_azure_endpoint',
    azureKey:     'keg_azure_key',
    session:      'keg_current_session',
    ocrEngine:    'keg_ocr_engine',
    paddleUrl:    'keg_paddle_url',
    msClientId:   'keg_ms_client_id',
    msTenantId:   'keg_ms_tenant_id',
  };

  const DATA_VERSION = '6';
  const VERSION_KEY  = 'keg_data_version';

  const DEFAULTS = {
    shipTo: [
      'ACE Myanmar Mandalay','ACE Myanmar Yangon','ATSM Homalin','ATSM Kale',
      'ATSM Monywa','ATSM Shwebo','Aye Yan Aung Taunggyi','E Enterprises Magway',
      'E Enterprises Mandalay','E Enterprises Pakokku','E Enterprises Yangon',
      'Five Crown Yangon','Jade Flower Kawthoung','Kaung Su Han Yangon',
      'Lin Yone Thit Dawei','Mandalar Standard Mandalay','Mandalar Standard Pyinoolwin',
      'Mantayar Family HpaAn','Mantayar Family Myawaddy','Northern ABC Lashio',
      'Northern ABC Mandalay','Northern ABC Mawlamyine','Northern ABC Meiktila',
      'Northern ABC Muse','Northern ABC Myitkyina','Royal Tun Tauk Bago',
      'Royal Tun Tauk Pyay','Royal Tun Tauk Taungoo','Royal Tun Tauk Yangon',
      'San Marlar Myeik','Silver Sea Mandalay','Thaung Yinn Thitsar Hinthada',
      'Thaung Yinn Thitsar Naypyitaw','Thaung Yinn Thitsar Pathein',
      'Thaung Yinn Thitsar Pyapon','Thaung Yinn Thitsar Yangon',
      'Thu Htet Aung Family Kengtung','Thu Htet Aung Family Tachileik',
    ],
    kegSize: ['10L', '20L', '30L'],
    brand:   ['TIGER', 'BAWDAR', 'HEINEKEN', 'ABC'],
  };

  function _get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function init() {
    const storedVersion = localStorage.getItem(VERSION_KEY);
    if (storedVersion !== DATA_VERSION) {
      _set(KEYS.brand, DEFAULTS.brand);
      _set(KEYS.kegSize, DEFAULTS.kegSize);
      _set(KEYS.shipTo, DEFAULTS.shipTo);
      localStorage.setItem(VERSION_KEY, DATA_VERSION);
    }
    const storedSizes = _get(KEYS.kegSize, []);
    if (storedSizes.includes('50L') || storedSizes.includes('50l')) {
      _set(KEYS.kegSize, DEFAULTS.kegSize);
    }
    for (const [listName, defaultVal] of Object.entries(DEFAULTS)) {
      if (!localStorage.getItem(KEYS[listName])) {
        _set(KEYS[listName], defaultVal);
      }
    }
  }

  // List CRUD
  function getList(name)        { return _get(KEYS[name], DEFAULTS[name] || []); }
  function addToList(name, val) {
    const list = getList(name);
    const t = val.trim();
    if (!t || list.includes(t)) return false;
    list.push(t); _set(KEYS[name], list); return true;
  }
  function removeFromList(name, val) {
    const list = getList(name).filter(v => v !== val);
    _set(KEYS[name], list); return list;
  }

  // OCR / Gemini
  function getApiKey()           { return localStorage.getItem(KEYS.apiKey) || ''; }
  function setApiKey(k)          { localStorage.setItem(KEYS.apiKey, k); }
  const DEFAULT_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  function getGeminiEndpoint()   { return localStorage.getItem(KEYS.geminiEndpoint) || DEFAULT_GEMINI_URL; }
  function setGeminiEndpoint(u)  { localStorage.setItem(KEYS.geminiEndpoint, u); }

  // OpenAI
  function getOpenAiKey()        { return localStorage.getItem(KEYS.openaiKey) || ''; }
  function setOpenAiKey(k)       { localStorage.setItem(KEYS.openaiKey, k); }

  // Google Cloud Vision
  function getGcvKey()           { return localStorage.getItem(KEYS.gcvKey) || ''; }
  function setGcvKey(k)          { localStorage.setItem(KEYS.gcvKey, k); }

  // Vercel / Synapse endpoint
  function getVercelUrl()        { return localStorage.getItem(KEYS.vercelUrl) || ''; }
  function setVercelUrl(u)       { localStorage.setItem(KEYS.vercelUrl, u); }

  // Azure AI Vision
  function getAzureEndpoint()   { return localStorage.getItem(KEYS.azureEndpoint) || ''; }
  function setAzureEndpoint(u)  { localStorage.setItem(KEYS.azureEndpoint, u); }
  function getAzureKey()        { return localStorage.getItem(KEYS.azureKey) || ''; }
  function setAzureKey(k)       { localStorage.setItem(KEYS.azureKey, k); }

  // OCR engine preference
  function getOcrEngine()       { return localStorage.getItem(KEYS.ocrEngine) || 'auto'; }
  function setOcrEngine(e)      { localStorage.setItem(KEYS.ocrEngine, e); }

  // PaddleOCR server URL
  function getPaddleUrl()       { return localStorage.getItem(KEYS.paddleUrl) || ''; }
  function setPaddleUrl(u)      { localStorage.setItem(KEYS.paddleUrl, u); }

  // Microsoft 365 / Azure AD
  function getMsClientId()      { return localStorage.getItem(KEYS.msClientId) || ''; }
  function setMsClientId(id)    { localStorage.setItem(KEYS.msClientId, id); }
  function getMsTenantId()      { return localStorage.getItem(KEYS.msTenantId) || ''; }
  function setMsTenantId(id)    { localStorage.setItem(KEYS.msTenantId, id); }

  // Session
  function getSession()         { return _get(KEYS.session, null); }
  function setSession(s)        { _set(KEYS.session, s); }
  function clearSession()       { localStorage.removeItem(KEYS.session); }

  function getKegs() {
    const s = getSession(); return s ? (s.kegs || []) : [];
  }
  function addKeg(keg) {
    const s = getSession(); if (!s) return;
    keg.id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    keg.timestamp = new Date().toISOString();
    keg.status = keg.status || 'ok';
    s.kegs = s.kegs || []; s.kegs.push(keg);
    s.scannedCount = s.kegs.length; setSession(s); return keg;
  }
  function updateKeg(id, updates) {
    const s = getSession(); if (!s) return;
    const idx = s.kegs.findIndex(k => k.id === id); if (idx === -1) return;
    Object.assign(s.kegs[idx], updates, { status: 'edited' });
    setSession(s); return s.kegs[idx];
  }
  function deleteKeg(id) {
    const s = getSession(); if (!s) return;
    s.kegs = s.kegs.filter(k => k.id !== id);
    s.scannedCount = s.kegs.length; setSession(s);
  }
  function isDuplicate(lot) {
    const s = getSession();
    if (!s) return false;
    // All kegs in session share the same date+shipTo; duplicate = same lot number
    return getKegs().some(k => k.lotNumber === lot);
  }

  return {
    init, getList, addToList, removeFromList,
    getApiKey, setApiKey, getGeminiEndpoint, setGeminiEndpoint,
    getOpenAiKey, setOpenAiKey,
    getGcvKey, setGcvKey,
    getVercelUrl, setVercelUrl,
    getAzureEndpoint, setAzureEndpoint, getAzureKey, setAzureKey,
    getOcrEngine, setOcrEngine, getPaddleUrl, setPaddleUrl,
    getMsClientId, setMsClientId, getMsTenantId, setMsTenantId,
    getSession, setSession, clearSession, getKegs,
    addKeg, updateKeg, deleteKeg, isDuplicate
  };
})();


/* ===== admin.js ===== */
/**
 * admin.js — Admin CRUD for Ship To, Keg Size, Brand lists
 */
const Admin = (() => {
  const tabs = { shipto: 'shipTo', kegsize: 'kegSize', brand: 'brand' };

  function init() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    // Add buttons
    _bindAdd('shipto', 'new-shipto', 'add-shipto-btn', 'shipto-list');
    _bindAdd('kegsize', 'new-kegsize', 'add-kegsize-btn', 'kegsize-list');
    _bindAdd('brand', 'new-brand', 'add-brand-btn', 'brand-list');

    // Open / Close
    document.getElementById('open-admin-btn').addEventListener('click', () => {
      document.getElementById('admin-modal').classList.add('active');
      renderAll();
    });
    document.getElementById('close-admin-btn').addEventListener('click', () => {
      document.getElementById('admin-modal').classList.remove('active');
      populateDropdowns(); // refresh dropdowns after changes
    });
  }

  function _bindAdd(tabKey, inputId, btnId, listId) {
    const storeKey = tabs[tabKey];
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    btn.addEventListener('click', () => {
      if (Store.addToList(storeKey, input.value)) {
        input.value = '';
        renderList(storeKey, listId);
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    });
  }

  function renderList(storeKey, listId) {
    const ul = document.getElementById(listId);
    const items = Store.getList(storeKey);
    ul.innerHTML = items.map(item => `
      <li>
        <span>${item}</span>
        <button class="del-btn" data-store="${storeKey}" data-value="${item}" data-list="${listId}">&times;</button>
      </li>
    `).join('');
    ul.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Store.removeFromList(btn.dataset.store, btn.dataset.value);
        renderList(btn.dataset.store, btn.dataset.list);
      });
    });
  }

  function renderAll() {
    renderList('shipTo', 'shipto-list');
    renderList('kegSize', 'kegsize-list');
    renderList('brand', 'brand-list');
  }

  function populateDropdowns() {
    // ship-to is now a combobox (hidden input) — skip it here
    const kegSizes = Store.getList('kegSize').slice().sort((a, b) => (parseFloat(b) || 0) - (parseFloat(a) || 0));
    _fillSelect('keg-size', kegSizes, 'Select size…');
    _fillSelect('field-brand', Store.getList('brand'), 'Select brand…');
    _fillSelect('field-kegsize', kegSizes, 'Select size…');
  }

  function _fillSelect(id, items, placeholder) {
    const sel = document.getElementById(id);
    if (!sel || sel.tagName !== 'SELECT') return;
    const current = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` +
      items.map(i => `<option value="${i}"${i === current ? ' selected' : ''}>${i}</option>`).join('');
  }

  return { init, populateDropdowns, renderAll };
})();


/* ===== camera.js ===== */
const Camera = (() => {
  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let facingMode = 'environment';
  let currentDeviceIndex = 0;
  let devices = [];
  let qualityTimer = null;

  function init() {
    videoEl = document.getElementById('camera-feed');
    canvasEl = document.getElementById('camera-canvas');
  }

  async function start() {
    if (stream) stop();

    const strategies = [
      { video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode }, audio: false },
      { video: true, audio: false },
      null
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        let constraints = strategies[i];
        if (constraints === null) {
          const devs = await navigator.mediaDevices.enumerateDevices();
          devices = devs.filter(d => d.kind === 'videoinput');
          if (devices.length === 0) continue;
          const device = devices[currentDeviceIndex % devices.length];
          constraints = { video: { deviceId: { exact: device.deviceId } }, audio: false };
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = stream;
        await videoEl.play();
        _setStatus('ready', 'Camera ready');
        _startQualityCheck();
        console.log('Camera started with strategy', i + 1);
        return true;
      } catch (err) {
        console.warn(`Camera strategy ${i + 1} failed:`, err.message);
        continue;
      }
    }

    console.error('All camera strategies failed');
    _setStatus('error', 'Camera unavailable — check permissions');
    _showManualMode();
    return false;
  }

  function stop() {
    _stopQualityCheck();
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
  }

  async function switchCamera() {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    if (devices.length > 1) {
      currentDeviceIndex = (currentDeviceIndex + 1) % devices.length;
    }
    await start();
  }

  /**
   * Maps the CropSelector's viewport-fraction selection to native video pixel coordinates,
   * correctly accounting for object-fit: cover scaling and centering.
   */
  function _vpToVideoCoords(sel) {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    const vpRect = videoEl.getBoundingClientRect();
    const vpW = vpRect.width, vpH = vpRect.height;
    // object-fit: cover scales uniformly so the video covers the container
    const scale = Math.max(vpW / vw, vpH / vh);
    const displayW = vw * scale, displayH = vh * scale;
    // Offset where the video image starts relative to the container (negative = cropped off)
    const offsetX = (vpW - displayW) / 2;
    const offsetY = (vpH - displayH) / 2;
    const cropX = Math.max(0, Math.round((sel.left * vpW - offsetX) / scale));
    const cropY = Math.max(0, Math.round((sel.top  * vpH - offsetY) / scale));
    const cropR = Math.min(vw, Math.round(((sel.left + sel.width)  * vpW - offsetX) / scale));
    const cropB = Math.min(vh, Math.round(((sel.top  + sel.height) * vpH - offsetY) / scale));
    return { x: cropX, y: cropY, w: Math.max(1, cropR - cropX), h: Math.max(1, cropB - cropY) };
  }

  function captureFrame() {
    if (!videoEl || !videoEl.videoWidth) return null;
    const sel = CropSelector.getSelection();
    const { x, y, w, h } = _vpToVideoCoords(sel);
    canvasEl.width = w;
    canvasEl.height = h;
    canvasEl.getContext('2d').drawImage(videoEl, x, y, w, h, 0, 0, w, h);
    return canvasEl;
  }

  function captureBlob() {
    return new Promise((resolve) => {
      const canvas = captureFrame();
      if (!canvas) return resolve(null);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
    });
  }

  function captureDataURL() {
    const canvas = captureFrame();
    if (!canvas) return null;
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // ─── Live quality checker ──────────────────────────────────────────────────
  // Samples the guide-box area every 600ms and computes the standard deviation
  // of grayscale brightness. High stddev = good contrast = readable ink.
  // Thresholds tuned for dark/brown handwritten ink on metallic keg surface.

  function _checkQuality() {
    if (!videoEl || !videoEl.videoWidth || !stream) return;

    const size = 120;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = size;
    const tctx = tmp.getContext('2d');

    // Sample center region (matches guide-box area)
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    tctx.drawImage(
      videoEl,
      (vw - size) / 2, (vh - size) / 2, size, size,
      0, 0, size, size
    );

    const d = tctx.getImageData(0, 0, size, size).data;
    let sum = 0, sumSq = 0;
    const n = size * size;
    for (let i = 0; i < d.length; i += 4) {
      // Fast integer grayscale: (r*77 + g*150 + b*29) >> 8
      const g = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / n;
    const stddev = Math.sqrt(sumSq / n - mean * mean);

    const badge = document.getElementById('quality-badge');
    const label = document.getElementById('quality-text');
    if (!badge || !label) return;

    badge.className = 'quality-badge';
    if (stddev >= 28) {
      badge.classList.add('good');
      label.textContent = 'Ready';
    } else if (stddev >= 13) {
      badge.classList.add('fair');
      label.textContent = 'Adjust';
    } else {
      badge.classList.add('poor');
      label.textContent = 'Low';
    }
  }

  function _startQualityCheck() {
    _stopQualityCheck();
    // Short delay so video frame is fully available before first sample
    setTimeout(() => {
      _checkQuality();
      qualityTimer = setInterval(_checkQuality, 600);
    }, 800);
  }

  function _stopQualityCheck() {
    if (qualityTimer) { clearInterval(qualityTimer); qualityTimer = null; }
    const badge = document.getElementById('quality-badge');
    const label = document.getElementById('quality-text');
    if (badge) badge.className = 'quality-badge';
    if (label) label.textContent = '—';
  }
  // ──────────────────────────────────────────────────────────────────────────

  function _showManualMode() {
    const viewport = document.getElementById('camera-viewport');
    if (!viewport) return;
    let msg = viewport.querySelector('.camera-fallback');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'camera-fallback';
      msg.innerHTML = `
        <div class="fallback-content">
          <span class="fallback-icon">ðŸ“·</span>
          <p>Camera not available</p>
          <p class="fallback-hint">You can enter keg details manually in the fields panel →</p>
          <button class="btn btn-primary btn-sm" id="retry-camera-btn">Retry Camera</button>
        </div>
      `;
      viewport.appendChild(msg);
      msg.querySelector('#retry-camera-btn').addEventListener('click', () => {
        msg.remove();
        start();
      });
    }
  }

  function _setStatus(type, text) {
    const el = document.getElementById('scan-status');
    if (!el) return;
    el.className = 'scan-status ' + type;
    el.querySelector('.status-text').textContent = text;
  }

  function setStatus(type, text) { _setStatus(type, text); }

  return { init, start, stop, switchCamera, captureFrame, captureBlob, captureDataURL, setStatus };
})();


/* ===== ocr.js ===== */
const OCR = (() => {
  let worker = null;
  let ready = false;

  // Azure AI Vision — same engine as Power Automate "Extract text from image"
  async function _azureRecognize(canvas) {
    const endpoint = Store.getAzureEndpoint().replace(/\/$/, '');
    const key = Store.getAzureKey();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const url = `${endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/octet-stream' },
        body: blob,
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (!resp.ok) throw new Error(`Azure ${resp.status}`);
      const data = await resp.json();
      const lines = [];
      let totalConf = 0, wordCount = 0;
      for (const block of (data.readResult?.blocks || [])) {
        for (const line of (block.lines || [])) {
          lines.push({ y: line.boundingPolygon?.[0]?.y ?? 0, text: line.text });
          for (const word of (line.words || [])) {
            totalConf += (word.confidence || 0) * 100;
            wordCount++;
          }
        }
      }
      lines.sort((a, b) => a.y - b.y);
      return {
        text: lines.map(l => l.text).join('\n'),
        confidence: wordCount > 0 ? Math.round(totalConf / wordCount) : 0
      };
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  // PaddleOCR server URL — configurable via settings, defaults to localhost when on localhost.
  function _getPaddleUrl() {
    const stored = Store.getPaddleUrl();
    if (stored) {
      if (stored.includes('0.0.0.0')) {
        console.warn('[OCR] PaddleOCR URL uses 0.0.0.0 — use your machine\'s actual LAN IP (e.g. http://192.168.x.x:8000). Also: GitHub Pages (HTTPS) cannot reach plain HTTP servers — use ngrok for a secure tunnel.');
      }
      return stored.replace(/\/$/, '');
    }
    return ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:5001' : '';
  }

  let paddleAvailable = null; // null = unchecked, true/false after first ping

  async function _checkPaddle() {
    // Skip PaddleOCR entirely when user forced Tesseract-only mode.
    if (Store.getOcrEngine() === 'tesseract') { paddleAvailable = false; return false; }
    const PADDLE_URL = _getPaddleUrl();
    if (!PADDLE_URL) { paddleAvailable = false; return false; }
    if (paddleAvailable !== null) return paddleAvailable;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      // ngrok-skip-browser-warning bypasses ngrok's interstitial HTML page for programmatic requests.
      const resp = await fetch(`${PADDLE_URL}/ping`, {
        signal: ctrl.signal,
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      clearTimeout(tid);
      if (!resp.ok) { paddleAvailable = false; return false; }
      // Verify it's a real JSON response from the server, not ngrok's HTML interstitial.
      const ct = resp.headers.get('content-type') || '';
      paddleAvailable = ct.includes('application/json') || ct.includes('text/plain');
    } catch {
      paddleAvailable = false;
    }
    return paddleAvailable;
  }

  async function _paddleRecognize(canvas) {
    // PNG is lossless — JPEG compression blurs dot-matrix edges and reduces OCR accuracy.
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    try {
      const resp = await fetch(`${_getPaddleUrl()}/ocr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ image: base64 }),
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      return { text: data.text || '', confidence: data.confidence || 0 };
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  /**
   * Chrome Android's native TextDetector API — uses the same ML as Google Lens.
   * This is on-device, no server, and much better than Tesseract for printed text.
   * Available in Chrome on Android; not available in Safari/Firefox.
   */
  async function _nativeOCR(canvas) {
    if (!('TextDetector' in window)) return null;
    try {
      const detector = new TextDetector();
      const results = await detector.detect(canvas);
      if (!results || !results.length) return null;
      // Sort top-to-bottom so line order matches the 3-line label format
      const text = results
        .sort((a, b) => a.boundingBox.top - b.boundingBox.top)
        .map(r => r.rawValue)
        .join('\n');
      return { text, confidence: 85 };
    } catch {
      return null;
    }
  }

  async function init() {
    try {
      Camera.setStatus('reading', 'Loading OCR…');
      worker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            Camera.setStatus('reading', `Reading… ${pct}%`);
          }
        }
      });
      await worker.setParameters({
        // PSM 6 = single uniform block of text.
        // CRITICAL: do NOT use PSM 11 (sparse) on metallic surfaces — it reads
        // every scratch and surface mark as a character.
        tessedit_pageseg_mode: '6',
        // NO character whitelist — the LSTM neural network (OEM 1) performs
        // worse with a whitelist because it forces incorrect character mapping.
        // Let LSTM output freely then apply OCR corrections in llm.js._fixOCR().
      });
      ready = true;
      Camera.setStatus('ready', 'Ready');
    } catch (err) {
      console.error('OCR init error:', err);
      Camera.setStatus('error', 'OCR failed to load');
    }
  }

  /**
   * forceInvert = undefined → auto-detect (invert when background is dark, mean < 100)
   * forceInvert = true      → always invert
   * forceInvert = false     → never invert
   *
   * Pipeline: 4× upscale → max(R,G,B) grayscale → 3×3 box blur (kills metallic
   * surface noise) → Otsu's threshold (finds the optimal ink/background split
   * automatically per image, giving a clean binary result for Tesseract).
   *
   * Why this beats the old ×2.5 linear contrast:
   *   Linear contrast leaves mid-tones as gray — Tesseract treats gray pixels as
   *   ambiguous and guesses wrong characters. Otsu's always produces pure black/white,
   *   which is what Tesseract's LSTM engine is optimised for.
   */
  function _preprocess(src, forceInvert) {
    const scale = 6; // 6× gives ~48-60px character height — better for dot-matrix fonts
    const W = src.width * scale;
    const H = src.height * scale;
    const dst = document.createElement('canvas');
    dst.width = W;
    dst.height = H;
    const ctx = dst.getContext('2d');
    ctx.drawImage(src, 0, 0, W, H);

    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const n = W * H;

    // Pass 1: max(R,G,B) grayscale — preserves ink contrast on green and silver kegs
    const gray = new Uint8Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      gray[i] = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      sum += gray[i];
    }

    // Use mid-range pixels (20–200) to decide invert so that the very dark keg
    // ring shadow (brightness < 20) doesn't pull the mean below 100 and trigger
    // a false invert on a normal silver-background label.
    // Include pixels up to 240 (not just 200) so bright keg body pixels are counted.
    // If we stop at 200, the bright keg body is excluded, leaving only dark pixels,
    // which drags the mean below the threshold and falsely triggers inversion.
    let midSum = 0, midCnt = 0;
    for (let i = 0; i < n; i++) {
      const v = gray[i];
      if (v >= 20 && v <= 240) { midSum += v; midCnt++; }
    }
    // Use threshold 50 (not 80): only truly dark-background images (black keg, white ink)
    // should invert. Silver labels with dark ink always have midMean > 50 even in shadow.
    const midMean = midCnt > n * 0.1 ? midSum / midCnt : sum / n;
    const autoInvert = midMean < 50;
    const invert = (forceInvert === undefined) ? autoInvert : forceInvert;
    console.log(`[OCR preprocess] midMean=${midMean.toFixed(1)} midCnt=${midCnt} n=${n} autoInvert=${autoInvert} invert=${invert}`);
    if (invert) {
      for (let i = 0; i < n; i++) gray[i] = 255 - gray[i];
    }

    // Pass 2: 3×3 box blur — smooths metallic surface scratches and specular
    // highlights that the old ×2.5 boost was amplifying into false characters
    const smooth = new Uint8Array(n);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W) {
              s += gray[ny * W + nx]; c++;
            }
          }
        }
        smooth[y * W + x] = (s / c + 0.5) | 0;
      }
    }

    // Pass 3: Bradley's local adaptive threshold with keg-edge column exclusion.
    //
    // Global thresholding (Otsu, per-row) fails on cylindrical keg labels because
    // the label centre is darker than its edges due to the curvature — the bright
    // edges set a global threshold that blacks out the dimmer centre background.
    // Bradley's computes a per-pixel threshold from its local neighbourhood mean,
    // so each region calibrates independently regardless of global illumination.
    //
    // Column mean < 40 → permanently dark keg-ring-shadow column → forced WHITE.
    const colMean = new Float32Array(W);
    for (let y = 0; y < H; y++) {
      const base = y * W;
      for (let x = 0; x < W; x++) colMean[x] += smooth[base + x];
    }
    for (let x = 0; x < W; x++) colMean[x] /= H;
    const isEdgeCol = new Uint8Array(W);
    for (let x = 0; x < W; x++) isEdgeCol[x] = colMean[x] < 40 ? 1 : 0;

    // Integral image (summed area table) for O(1) local mean queries
    const intg = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let rowSum = 0;
      for (let x = 0; x < W; x++) {
        rowSum += smooth[y * W + x];
        intg[(y + 1) * (W + 1) + (x + 1)] = intg[y * (W + 1) + (x + 1)] + rowSum;
      }
    }

    // winR: neighbourhood radius = 12% of image width, min 8 px.
    // Large enough to span background on both sides of an ink stroke,
    // small enough not to cross between text-line bands.
    // bias: pixel is ink when it is >= 15% below its local mean.
    const winR = Math.max(8, Math.round(W * 0.12));
    const bias = 0.15;
    console.log(`[OCR preprocess] bradley winR=${winR} bias=${bias} invert=${invert} W=${W} H=${H}`);

    for (let y = 0; y < H; y++) {
      const base = y * W;
      for (let x = 0; x < W; x++) {
        const idx = base + x;
        let v;
        if (isEdgeCol[x]) {
          v = 255;
        } else {
          const x1 = Math.max(0, x - winR), x2 = Math.min(W - 1, x + winR);
          const y1 = Math.max(0, y - winR), y2 = Math.min(H - 1, y + winR);
          const count = (x2 - x1 + 1) * (y2 - y1 + 1);
          // Multiply form avoids division: pixel >= localMean*(1-bias)
          // is equivalent to pixel*count >= sum*(1-bias)
          const sum = intg[(y2 + 1) * (W + 1) + (x2 + 1)]
                    - intg[y1       * (W + 1) + (x2 + 1)]
                    - intg[(y2 + 1) * (W + 1) + x1      ]
                    + intg[y1       * (W + 1) + x1      ];
          v = smooth[idx] * count >= sum * (1 - bias) ? 255 : 0;
        }
        d[idx * 4] = d[idx * 4 + 1] = d[idx * 4 + 2] = v;
        d[idx * 4 + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return dst;
  }

  /**
   * Analyzes the captured frame to find and crop to the keg label text band.
   * Uses per-row contrast (stddev of max(R,G,B)) to locate the rows that contain
   * dot-matrix ink. Returns the tight crop, or the original canvas if no text band found.
   * Operates on the raw (pre-preprocessing) canvas so color info is intact.
   */
  function _findLabelCrop(canvas) {
    const W = canvas.width, H = canvas.height;
    const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;

    // Per-row contrast (stddev) AND mean brightness
    const rowContrast = new Float32Array(H);
    const rowMean    = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let sum = 0, sumSq = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const v = Math.max(d[i], d[i + 1], d[i + 2]);
        sum += v;
        sumSq += v * v;
      }
      const mean = sum / W;
      rowMean[y]    = mean;
      rowContrast[y] = Math.sqrt(Math.max(0, sumSq / W - mean * mean));
    }

    // Only count rows that have ink-level contrast AND non-shadow brightness.
    // Rows with mean < 35 are deep ring-shadow (no label surface).
    // MEAN_MAX raised to 250: white/cream label backgrounds can have row mean
    // up to ~230 on bright text rows; 210 falsely excluded them.
    // Bright background-only rows also have low contrast (<12) so they're
    // already excluded by TEXT_THRESH — MEAN_MAX is just a safety cap.
    const TEXT_THRESH = 12;
    const MEAN_MIN   = 35;
    const MEAN_MAX   = 250;
    let minRow = -1, maxRow = -1;
    for (let y = 0; y < H; y++) {
      if (rowContrast[y] > TEXT_THRESH && rowMean[y] >= MEAN_MIN && rowMean[y] <= MEAN_MAX) {
        if (minRow < 0) minRow = y;
        maxRow = y;
      }
    }

    if (minRow < 0 || (maxRow - minRow) < 8) return { canvas, cropped: false };

    // Pad so ascenders/descenders aren't clipped
    const pad = Math.max(6, Math.round(H * 0.05));
    const y0 = Math.max(0, minRow - pad);
    const y1 = Math.min(H, maxRow + pad);

    const label = document.createElement('canvas');
    label.width = W;
    label.height = y1 - y0;
    label.getContext('2d').drawImage(canvas, 0, y0, W, y1 - y0, 0, 0, W, y1 - y0);
    return { canvas: label, cropped: true };
  }

  /**
   * Returns true if the canvas looks like a keg metallic silver or green surface.
   * Keg labels sit on bright silver or Heineken-green metallic backgrounds.
   */
  function _isKegSurface(canvas) {
    const sW = Math.min(canvas.width, 100), sH = Math.min(canvas.height, 60);
    const d = canvas.getContext('2d').getImageData(0, 0, sW, sH).data;
    const n = sW * sH;
    let sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0; i < n; i++) {
      sumR += d[i * 4]; sumG += d[i * 4 + 1]; sumB += d[i * 4 + 2];
    }
    const r = sumR / n, g = sumG / n, b = sumB / n;
    const brightness = (r + g + b) / 3;
    const isGreen = g > r + 20 && g > b + 20 && g > 60;
    const isSilver = brightness > 90 && Math.abs(r - g) < 40 && Math.abs(g - b) < 40;
    return isGreen || isSilver;
  }

  /**
   * Splits the label canvas into individual text-line bands using the same
   * row-contrast technique as _findLabelCrop, but at a finer scale to separate
   * the 3 dot-matrix lines from each other.
   * Returns [{y0, y1}, ...] top-to-bottom, or [] if lines cannot be separated.
   */
  function _findTextLines(canvas) {
    const W = canvas.width, H = canvas.height;
    const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;

    const rowContrast = new Float32Array(H);
    const rowMean2    = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let sum = 0, sumSq = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const v = Math.max(d[i], d[i + 1], d[i + 2]);
        sum += v; sumSq += v * v;
      }
      const mean = sum / W;
      rowMean2[y]    = mean;
      rowContrast[y] = Math.sqrt(Math.max(0, sumSq / W - mean * mean));
    }

    // Walk the contrast profile and collect contiguous high-contrast bands.
    // Same mean-brightness gate as _findLabelCrop to skip ring shadow / keg body rows.
    // Raised to 18 (from 12): background label rows between text lines have
    // contrast ~12–16 from metallic surface texture; raising the bar prevents
    // those gap rows from being counted as "text", letting _findTextLines
    // produce separate bands for each of the 3 dot-matrix text lines.
    const THRESH  = 18;
    const MIN_H   = 6;
    const LN_MEAN_MIN = 35;
    const LN_MEAN_MAX = 250;
    const lines  = [];
    let inLine = false, start = 0;

    for (let y = 0; y <= H; y++) {
      const hot = y < H && rowContrast[y] > THRESH && rowMean2[y] >= LN_MEAN_MIN && rowMean2[y] <= LN_MEAN_MAX;
      if (!inLine && hot)  { inLine = true; start = y; }
      else if (inLine && !hot) {
        if (y - start >= MIN_H) {
          const pad = Math.max(2, Math.round((y - start) * 0.12));
          lines.push({ y0: Math.max(0, start - pad), y1: Math.min(H, y + pad) });
        }
        inLine = false;
      }
    }
    return lines;
  }

  /**
   * Crops a horizontal slice of canvas to its own canvas element.
   */
  function _cropLine(canvas, y0, y1) {
    const lc = document.createElement('canvas');
    lc.width  = canvas.width;
    lc.height = y1 - y0;
    lc.getContext('2d').drawImage(canvas, 0, y0, canvas.width, y1 - y0, 0, 0, canvas.width, y1 - y0);
    return lc;
  }

  async function _tesseractRecognize(canvas) {
    if (!ready || !worker) await init();

    // Preprocess once — reused for density analysis, debug image, and PSM-6 fallback
    const processed = _preprocess(canvas);
    const pW = processed.width, pH = processed.height;
    const pScale = pW / canvas.width; // actual scale factor from _preprocess (currently 6)
    const pD = processed.getContext('2d').getImageData(0, 0, pW, pH).data;
    const _dbgImg = document.getElementById('ocr-debug-img');
    if (_dbgImg) { _dbgImg.src = processed.toDataURL('image/png'); _dbgImg.style.display = 'block'; }

    // ── Band detection + refinement of oversized bands ─────────────────────
    // _findTextLines operates on the raw canvas (color, not binary).
    // Bands wider than MAX_LINE_H are keg-body / embossed-marking regions; they
    // can still CONTAIN a label line at their bottom edge (the ring shadow, now
    // lifted to white in the preprocessed image, creates a density gap that
    // separates noise from the actual label text row).
    const rawLines  = _findTextLines(canvas);
    const MAX_LINE_H = Math.round(canvas.height * 0.30);

    // Within an oversized band, walk the preprocessed image row-by-row and cluster
    // rows with text-like black-pixel density (3–28 %) into sub-bands.
    //
    // Two-pass approach required for Bradley's precise binary output:
    //   Pass 1 — collect all short density runs (â‰¥ 2 original px).
    //            Bradley draws individual dot-matrix dot rows cleanly, with 0%
    //            density in the 1–3 px gaps between dot rows.  The old â‰¥10 px
    //            minimum silently discarded every single dot row, leaving nothing.
    //   Pass 2 — merge runs whose gap is < 6 original px (= 24 scaled px).
    //            This bridges inter-dot gaps within one text line without
    //            merging separate text lines (which are â‰¥ 10 original px apart).
    //   Filter — keep merged bands â‰¥ 10 original px tall.
    function extractSubBands(band) {
      const py0 = Math.min(band.y0 * pScale, pH);
      const py1 = Math.min(band.y1 * pScale, pH);

      // Pass 1: collect density runs â‰¥ 2 original px in the preprocessed image.
      const minRun = Math.round(pScale * 2); // 2 original px in scaled coords
      const runs = [];
      let inRun = false, runStart = 0;
      for (let y = py0; y <= py1; y++) {
        let density = 0;
        if (y < py1) {
          let black = 0;
          const row = y * pW;
          for (let x = 0; x < pW; x++) { if (pD[(row + x) * 4] < 128) black++; }
          density = black / pW;
        }
        // 0.08 minimum filters inter-line Bradley noise (typically 2–7%)
        // while keeping real dot-matrix ink rows (typically 8–25%).
        const isText = density >= 0.08 && density <= 0.28;
        if (!inRun && isText)  { inRun = true; runStart = y; }
        else if (inRun && !isText) {
          if (y - runStart >= minRun) runs.push({ s: runStart, e: y });
          inRun = false;
        }
      }
      if (runs.length === 0) return [];

      // Pass 2: merge runs with gap < ~2.5 original px.
      // Bridges the tiny inter-dot gaps within one text line
      // without merging separate text lines (â‰¥ 8–10 original px apart).
      const GAP = Math.round(pScale * 2.5);
      const merged = [{ s: runs[0].s, e: runs[0].e }];
      for (let i = 1; i < runs.length; i++) {
        const prev = merged[merged.length - 1];
        if (runs[i].s - prev.e < GAP) { prev.e = runs[i].e; }
        else { merged.push({ s: runs[i].s, e: runs[i].e }); }
      }

      // Filter (â‰¥ 10 original px) and convert back to original-scale coordinates.
      const minH = Math.round(pScale * 10);
      return merged
        .filter(m => m.e - m.s >= minH)
        .map(m => {
          const pad = Math.max(pScale, ((m.e - m.s) * 0.12) | 0);
          return {
            y0: Math.max(band.y0, ((m.s - pad) / pScale) | 0),
            y1: Math.min(band.y1, ((m.e + pad) / pScale) | 0)
          };
        });
    }

    const lines = [];
    for (const band of rawLines) {
      if (band.y1 - band.y0 <= MAX_LINE_H) {
        lines.push(band);
      } else {
        const subs = extractSubBands(band);
        if (subs.length > 0) {
          lines.push(...subs);
        } else {
          // extractSubBands found nothing (band has no text in the binary image).
          // Fall back to the raw band so the PSM-6 full-block path can attempt it
          // rather than silently dropping the largest region on screen.
          lines.push(band);
        }
      }
    }

    const _dbgPath = lines.length === 1 ? 'PSM-6 label-crop'
                   : lines.length >= 2 && lines.length <= 6 ? 'PSM-7 per-line'
                   : 'PSM-6 full block';
    console.log(`[OCR] raw=${rawLines.length} refined=${lines.length} → ${_dbgPath} | ${canvas.width}×${canvas.height}`);
    const _dbgInfo = document.getElementById('ocr-debug-info');
    if (_dbgInfo) _dbgInfo.textContent =
      `Canvas: ${canvas.width}×${canvas.height}px\nBands raw=${rawLines.length} refined=${lines.length}: ${lines.map((l,i)=>`[${i}]h=${l.y1-l.y0}`).join(' ')}\nPath: ${_dbgPath}`;

    // ── PSM-6 on tight label crop (single refined band) ───────────────────
    if (lines.length === 1) {
      Camera.setStatus('reading', 'Reading label…');
      const { y0, y1 } = lines[0];
      const r = await worker.recognize(_preprocess(_cropLine(canvas, y0, y1)));
      const text = (r.data.text || '').trim();
      const tu = text.toUpperCase();
      const looksLikeLabel =
        /[LI1][0-9OISBGZE]{3}/.test(tu) ||
        /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.test(tu);
      if (text.replace(/\s/g, '').length > 3 && looksLikeLabel) {
        return { text, confidence: r.data.confidence || 0 };
      }
    }

    // ── PSM-7 per-line (2–6 refined bands) ───────────────────────────────
    if (lines.length >= 2 && lines.length <= 6) {
      Camera.setStatus('reading', `Reading ${lines.length} lines…`);
      const lineTexts = [];
      let totalConf = 0;
      for (const { y0, y1 } of lines) {
        // Tall bands (â‰¥40px) contain multiple text lines — use PSM-6 (block).
        // Narrow bands are single lines — use PSM-7.
        const psm = (y1 - y0 >= 40) ? '6' : '7';
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const r = await worker.recognize(_preprocess(_cropLine(canvas, y0, y1)));
        lineTexts.push((r.data.text || '').trim());
        totalConf += r.data.confidence || 0;
      }
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
      const text = lineTexts.join('\n');
      const tu = text.toUpperCase();
      const looksLikeLabel =
        /[LI1][0-9OISBGZE]{3}/.test(tu) ||
        /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.test(tu);
      if (text.replace(/\s/g, '').length > 3 && looksLikeLabel) {
        return { text, confidence: Math.round(totalConf / lineTexts.length) };
      }
    }

    // ── PSM-6 full block fallback ──────────────────────────────────────────
    let result = await worker.recognize(processed);
    let text = (result.data.text || '').trim();
    let confidence = result.data.confidence || 0;

    if (text.length < 3) {
      Camera.setStatus('reading', 'Retrying (inverted)…');
      const rInv = await worker.recognize(_preprocess(canvas, true));
      const tInv = (rInv.data.text || '').trim();
      if (tInv.length > text.length) { text = tInv; confidence = rInv.data.confidence || 0; }
    }

    if (text.length < 3) {
      Camera.setStatus('reading', 'Retrying (PSM 4)…');
      await worker.setParameters({ tessedit_pageseg_mode: '4' });
      const r4 = await worker.recognize(processed);
      const t4 = (r4.data.text || '').trim();
      if (t4.length > text.length) { text = t4; confidence = r4.data.confidence || 0; }
      await worker.setParameters({ tessedit_pageseg_mode: '6' });
    }

    return { text, confidence };
  }

  async function recognize(canvas) {
    Camera.setStatus('reading', 'Reading…');
    try {
      // ── 0. Azure AI Vision (highest accuracy — Power Automate OCR engine) ──
      if (Store.getAzureKey() && Store.getAzureEndpoint()) {
        Camera.setStatus('reading', 'Reading (Azure AI)…');
        try {
          const processed = _preprocess(canvas);
          const ar = await _azureRecognize(processed);
          if (ar && ar.text.length > 0) {
            const status = ar.confidence > 70 ? 'good' : ar.confidence > 40 ? 'medium' : 'low';
            Camera.setStatus(
              status === 'good' ? 'ready' : 'reading',
              status === 'good' ? 'Good read (Azure AI)' : 'Low quality (Azure AI)'
            );
            return { text: ar.text, confidence: ar.confidence, status, engine: 'azure' };
          }
          console.warn('Azure OCR returned empty — falling back');
        } catch (err) {
          console.warn('Azure OCR failed, falling back:', err.message);
        }
      }

      // ── Label detection: find text band and crop to it ────────────────────
      // Crops the capture to just the rows containing dot-matrix ink so that
      // text from other objects or surfaces in the frame is excluded entirely.
      const { canvas: labelCanvas, cropped } = _findLabelCrop(canvas);
      if (!cropped && !_isKegSurface(canvas)) {
        Camera.setStatus('reading', 'Adjust — point at keg label');
      }

      // ── 1. PaddleOCR (localhost only — best accuracy) ──────────────────────
      const hasPaddle = await _checkPaddle();
      if (hasPaddle) {
        Camera.setStatus('reading', 'Reading (PaddleOCR)…');
        try {
          // PaddleOCR needs the natural (raw) image — send raw canvas, not the binarized one.
          const pr = await _paddleRecognize(labelCanvas);
          if (pr.text.length > 0) {
            const status = pr.confidence > 70 ? 'good' : pr.confidence > 40 ? 'medium' : 'low';
            Camera.setStatus(
              status === 'good' ? 'ready' : 'reading',
              status === 'good' ? 'Good read (PaddleOCR)' : 'Low quality (PaddleOCR)'
            );
            return { text: pr.text, confidence: pr.confidence, status, engine: 'paddle' };
          }
          console.warn('PaddleOCR returned empty — falling back');
        } catch (err) {
          console.warn('PaddleOCR failed, falling back:', err.message);
          paddleAvailable = false;
        }
      }

      // ── 2. Native TextDetector (Android Chrome — Google's on-device ML OCR) ─
      Camera.setStatus('reading', 'Reading…');
      const nativeResult = await _nativeOCR(labelCanvas);
      if (nativeResult && nativeResult.text.length > 2) {
        console.log('Native TextDetector succeeded');
        Camera.setStatus('ready', 'Good read (Native ML)');
        return { text: nativeResult.text, confidence: nativeResult.confidence, status: 'good', engine: 'native' };
      }

      // ── 3. Tesseract fallback ──────────────────────────────────────────────
      Camera.setStatus('reading', 'Reading (Tesseract)…');
      let { text, confidence } = await _tesseractRecognize(labelCanvas);

      // If the label-crop result contains no recognisable keg patterns, retry on
      // the original (guide-box) canvas. This handles the common real-world case
      // where _findLabelCrop latches onto high-contrast EMBOSSED text stamped on
      // the keg body (e.g. "PROPERTY OF HEINEKEN 3-0801-1") instead of the small
      // dot-matrix printed label below — embossed characters cast deep shadows that
      // produce much higher row-contrast than the actual ink.
      if (text.length > 0 && cropped) {
        const tu = text.toUpperCase();
        const hasKegPattern =
          /[LI1][0-9OISBGZE]{3}/.test(tu) ||
          /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.test(tu);
        if (!hasKegPattern) {
          Camera.setStatus('reading', 'Retrying full frame…');
          const r2 = await _tesseractRecognize(canvas);
          if (r2.text.length > text.length) { text = r2.text; confidence = r2.confidence; }
        }
      }

      if (text.length < 1) {
        Camera.setStatus('error', 'No text found — aim at the label');
        return { text: '', confidence: 0, status: 'low', engine: 'tesseract' };
      }

      const status = confidence > 70 ? 'good' : confidence > 40 ? 'medium' : 'low';
      Camera.setStatus(
        status === 'good' ? 'ready' : 'reading',
        status === 'good' ? 'Good read' : 'Low quality'
      );
      return { text, confidence, status, engine: 'tesseract' };
    } catch (err) {
      console.error('OCR error:', err);
      Camera.setStatus('error', 'OCR error');
      return { text: '', confidence: 0, status: 'error', engine: 'none' };
    }
  }

  function resetPaddleCache() { paddleAvailable = null; }

  async function recognizeGCV(canvas) {
    const apiKey = Store.getGcvKey();
    if (!apiKey) throw new Error('No GCV API key');
    const base64 = canvas.toDataURL('image/jpeg', 0.92).replace(/^data:[^;]+;base64,/, '');
    const resp = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          imageContext: { languageHints: ['en'] }
        }]
      })
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await resp.json();
    const text = data.responses?.[0]?.fullTextAnnotation?.text
              || data.responses?.[0]?.textAnnotations?.[0]?.description
              || '';
    const status = text.length > 10 ? 'good' : text.length > 2 ? 'medium' : 'low';
    return { text, confidence: 90, status, engine: 'gcv' };
  }

  return { init, recognize, recognizeGCV, resetPaddleCache };
})();


/* ===== llm.js ===== */
const LLM = (() => {

  function _geminiRequest(apiKey) {
    const endpoint = Store.getGeminiEndpoint();
    const isGoogle = endpoint.includes('googleapis.com');
    return {
      url: isGoogle ? `${endpoint}?key=${apiKey}` : endpoint,
      headers: isGoogle
        ? { 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json', 'api-key': apiKey }
    };
  }

  // Vision prompt — sent WITH the image so Gemini reads the label directly
  const VISION_PROMPT = `You are reading a beer keg label. The image shows a cropped section of a metallic keg surface with dot-matrix machine-printed ink.

Locate the printed text (NOT embossed markings, NOT decorative artwork on the keg) and extract exactly these 3 fields:

LOT NUMBER — always starts with the letter L followed by exactly 7 digits (e.g. L6069104). There may be a timestamp like (08:15) after it — ignore everything after the digits. Remove any spaces OCR inserted between digits. If the L is misread as I or 1, treat it as L.

BEST BEFORE DATE — format DD MON YYYY (e.g. 10 SEP 2026). Convert to YYYY-MM-DD for output.
Valid months: JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC

BRAND — must match exactly one of: {{BRANDS}}
The line may have extra text after the brand name — extract only the matching brand word.

Common reading issues on metallic surfaces: digit 0 looks like letter O, digit 1 looks like I or l, digit 5 looks like S, digit 8 looks like B.

Return ONLY valid JSON, no markdown, no extra text:
{"lotNumber":"","brand":"","bestBefore":"","confidence":{"lot":0,"brand":0,"bbd":0}}

Confidence 0-100 per field.`;

  const PROMPT = `You are reading handwritten ink text from a beer keg label.
The keg has exactly 3 lines of brown or black handwritten ink. Ignore ALL printed, embossed, or scripted text on the keg body.

Extract ONLY these 3 fields in order:

LINE 1 — LOT NUMBER:
- The line may contain extra content after the lot number, such as "(13:20)" — IGNORE everything after the first L+7digit sequence
- Always starts with letter "L" followed by exactly 7 digits
- Remove any spaces OCR inserted between the digits
- Examples: "L6012345 (13:20)" → "L6012345",  "L 123 4 567 (09:00)" → "L1234567"
- If no L+7digit pattern exists, return ""

LINE 2 — BEST BEFORE DATE:
- Format is always: DD MON YYYY (e.g., "14 SEP 2026", "3 JAN 2025")
- Valid months: JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC
- Convert to YYYY-MM-DD for output (e.g., "14 SEP 2026" → "2026-09-14")
- If not found, return ""

LINE 3 — BRAND:
- The line may contain extra text after the brand name (e.g., "BAWDAR NKL", "HEINEKEN 330") — extract only the part that matches the known list
- Must match EXACTLY one of: {{BRANDS}}
- Case-insensitive match; return in UPPERCASE exactly as listed
- If no match found in the line, return ""

Common OCR fixes: 0â†”O, 1â†”I/l, 5â†”S, 8â†”B

OCR text from keg:
"""
{{OCR_TEXT}}
"""

Return ONLY valid JSON, no markdown, no extra text:
{"lotNumber":"","brand":"","bestBefore":"","confidence":{"lot":0,"brand":0,"bbd":0}}

Confidence 0-100: how certain you are each field is correct.`;

  async function extract(ocrText) {
    const apiKey = Store.getApiKey();
    if (!apiKey) return _fallbackParse(ocrText);

    const brands = Store.getList('brand').join(', ');
    const prompt = PROMPT
      .replace('{{BRANDS}}', brands)
      .replace('{{OCR_TEXT}}', ocrText);

    try {
      const { url: _gUrl, headers: _gHeaders } = _geminiRequest(apiKey);
      const resp = await fetch(_gUrl, {
        method: 'POST',
        headers: _gHeaders,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      });

      if (!resp.ok) {
        console.error('Gemini API error:', resp.status);
        return _fallbackParse(ocrText);
      }

      const data = await resp.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return _fallbackParse(ocrText);

      const parsed = JSON.parse(jsonMatch[0]);

      // Enforce L + exactly 7 digits
      let lot = (parsed.lotNumber || '').replace(/\s/g, '').toUpperCase();
      if (!/^L\d{7}$/.test(lot)) {
        const m = lot.match(/L(\d{7})/);
        lot = m ? 'L' + m[1] : '';
      }

      // Enforce brand must be in predefined list
      const brandList = Store.getList('brand').map(b => b.toUpperCase());
      const brand = (parsed.brand || '').toUpperCase();
      const validBrand = brandList.includes(brand) ? brand : '';

      return {
        lotNumber: lot,
        brand: validBrand,
        bestBefore: parsed.bestBefore || '',
        confidence: parsed.confidence || { lot: 50, brand: 50, bbd: 50 },
        source: 'llm'
      };
    } catch (err) {
      console.error('LLM extraction error:', err);
      return _fallbackParse(ocrText);
    }
  }

  const MONTH_MAP = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
  };

  /**
   * Fix systematic OCR misreads before regex matching.
   * Uses capture groups (not lookbehind) for full browser compatibility.
   */
  function _fixOCR(text) {
    let t = text.toUpperCase();

    // Â¢ (cent sign) is a common Tesseract misread for ( on dot-matrix labels.
    // Replace it before bracket stripping so downstream noParens handles it.
    t = t.replace(/Â¢/g, '(');

    // Within lot-number spans (L + digit-like chars + spaces), substitute
    // ambiguous letters → digits. G→6 and E→6 are critical for dot-matrix
    // fonts where the digit 6 is frequently misread as G or E by Tesseract.
    t = t.replace(/L[0-9OISBGZEe\s]{6,18}/g, span =>
      span.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5')
          .replace(/B/g, '8').replace(/G/g, '6').replace(/Z/g, '2')
          .replace(/E/g, '6')
    );

    // Fix O/I/S/B digit errors anywhere a 4-digit year appears (e.g. 2O26 → 2026)
    t = t.replace(/\b2[0-9OISB]{3}\b/g, span =>
      span.replace(/O/g, '0').replace(/I/g, '1').replace(/S/g, '5').replace(/B/g, '8')
    );
    // Same fix for 2-digit day (e.g. 1O SEP → 10 SEP, IO SEP → 10 SEP)
    // Tens digit includes I/1 because Tesseract misreads "1" as "I" on dot-matrix labels
    t = t.replace(/\b([0-3IO1][0-9OISB])\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g,
      (m, day, mon) => day.replace(/O/g, '0').replace(/I/g, '1') + ' ' + mon
    );

    // Fix common OCR errors in month name abbreviations
    const MONTH_FIXES = [
      [/\b1AN\b/g, 'JAN'], [/\b1UL\b/g, 'JUL'], [/\b1UN\b/g, 'JUN'],
      [/\b5EP\b/g, 'SEP'], [/\b0CT\b/g, 'OCT'], [/\b0EC\b/g, 'DEC'],
      [/\bFE8\b/g, 'FEB'], [/\bAU6\b/g, 'AUG'], [/\b4PR\b/g, 'APR'],
      [/\bM4Y\b/g, 'MAY'], [/\bN0V\b/g, 'NOV'],
    ];
    for (const [pat, rep] of MONTH_FIXES) t = t.replace(pat, rep);

    return t;
  }

  // Levenshtein edit distance — used for fuzzy brand matching
  function _editDist(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 2) return 99;
    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const curr = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        curr[j] = a[i-1] === b[j-1]
          ? prev[j-1]
          : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  function _fallbackParse(text) {
    const result = {
      lotNumber: '', brand: '', bestBefore: '',
      confidence: { lot: 0, brand: 0, bbd: 0 },
      source: 'regex'
    };

    const clean = _fixOCR(text);

    // ── LOT NUMBER ───────────────────────────────────────────────────────────
    // Remove any parenthetical/timestamp content first
    const noParens = clean.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' ');

    // Attempt 1 — L present (possibly misread as I or 1)
    // Character class includes all letters that are commonly misread from digits:
    // O→0, I→1, S→5, B→8, G→6 (very common for dot-matrix 6), Z→2
    const lotStrict = noParens.match(/[LI1]([0-9OISBGZEe\s]{7,18})/);
    if (lotStrict) {
      const digits = lotStrict[1]
        .replace(/O/g,'0').replace(/I/g,'1').replace(/S/g,'5')
        .replace(/B/g,'8').replace(/G/g,'6').replace(/Z/g,'2')
        .replace(/\D/g, '').substring(0, 7);
      if (digits.length === 7) {
        result.lotNumber = 'L' + digits;
        result.confidence.lot = 72;
      }
    }

    // Attempt 2 — L completely missing: grab any standalone 7-digit run
    // (PSM 11 can sometimes drop the leading L into a different text region)
    if (!result.lotNumber) {
      const bareMatch = noParens.match(/\b(\d{7})\b/);
      if (bareMatch) {
        result.lotNumber = 'L' + bareMatch[1];
        result.confidence.lot = 45;
      }
    }

    // ── DATE: DD MON YYYY ────────────────────────────────────────────────────
    const cleanAlpha = clean.replace(/[^\w\s\n]/g, ' ');
    const dateMatch = cleanAlpha.match(
      /(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/
    );
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = MONTH_MAP[dateMatch[2]];
      const year = parseInt(dateMatch[3]);
      if (year >= 2020 && year <= 2040) {
        result.bestBefore = `${year}-${month}-${day}`;
        result.confidence.bbd = 72;
      }
    }

    // ── BRAND ────────────────────────────────────────────────────────────────
    const brands = Store.getList('brand');

    // Pass 1 — exact substring (fastest, highest confidence)
    for (const b of brands) {
      if (cleanAlpha.includes(b.toUpperCase())) {
        result.brand = b;
        result.confidence.brand = 90;
        break;
      }
    }

    // Pass 2 — fuzzy per-word match using edit distance.
    // Allows 1 character error for brands â‰¥ 5 chars (e.g. BAWDAR→BAWDOR),
    // 2 errors for â‰¥ 8 chars (e.g. HEINEKEN→HE1NEKEN).
    if (!result.brand) {
      const words = cleanAlpha.split(/\s+/).filter(w => w.length >= 3);
      outer: for (const b of brands) {
        const bu = b.toUpperCase();
        const maxEdits = bu.length >= 8 ? 2 : bu.length >= 5 ? 1 : 0;
        if (maxEdits === 0) continue;
        for (const word of words) {
          if (Math.abs(word.length - bu.length) <= maxEdits &&
              _editDist(word, bu) <= maxEdits) {
            result.brand = b;
            result.confidence.brand = 60;
            break outer;
          }
        }
      }
    }

    return result;
  }

  /**
   * Send the captured image directly to Gemini Vision.
   * Returns null if API unavailable or call fails (caller should fall back to Tesseract).
   */
  async function extractFromImage(dataUrl) {
    const apiKey = Store.getApiKey();
    if (!apiKey || !dataUrl) return null;

    const brands = Store.getList('brand').join(', ');
    const prompt = VISION_PROMPT.replace('{{BRANDS}}', brands);
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');

    try {
      const { url: _gUrl, headers: _gHeaders } = _geminiRequest(apiKey);
      const resp = await fetch(_gUrl, {
        method: 'POST',
        headers: _gHeaders,
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
        })
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        console.error('Gemini Vision HTTP error:', resp.status, errBody);
        throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await resp.json();
      console.log('Gemini raw response:', JSON.stringify(data).slice(0, 1000));
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
               || data.candidates?.[0]?.output
               || data.output
               || data.text
               || data.response
               || '';
      if (!raw) {
        console.warn('Gemini response structure:', Object.keys(data));
        throw new Error('Unexpected response shape: ' + JSON.stringify(data).slice(0, 300));
      }
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      // Enforce L + exactly 7 digits
      let lot = (parsed.lotNumber || '').replace(/\s/g, '').toUpperCase();
      if (!/^L\d{7}$/.test(lot)) {
        const m = lot.match(/[LI1](\d{7})/);
        lot = m ? 'L' + m[1] : '';
      }

      // Enforce brand must be in predefined list
      const brandList = Store.getList('brand').map(b => b.toUpperCase());
      const brand = (parsed.brand || '').toUpperCase();
      const validBrand = brandList.includes(brand) ? brand : '';

      return {
        lotNumber: lot,
        brand: validBrand,
        bestBefore: parsed.bestBefore || '',
        confidence: parsed.confidence || { lot: 85, brand: 85, bbd: 85 },
        source: 'vision'
      };
    } catch (err) {
      console.error('Gemini Vision extraction error:', err);
      return null;
    }
  }

  async function extractFromImageOpenAI(dataUrl) {
    const apiKey = Store.getOpenAiKey();
    if (!apiKey || !dataUrl) return null;

    const brands = Store.getList('brand').join(', ');
    const prompt = VISION_PROMPT.replace('{{BRANDS}}', brands);

    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: prompt }
            ]
          }],
          max_tokens: 512,
          temperature: 0.1
        })
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await resp.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      let lot = (parsed.lotNumber || '').replace(/\s/g, '').toUpperCase();
      if (!/^L\d{7}$/.test(lot)) {
        const m = lot.match(/[LI1](\d{7})/);
        lot = m ? 'L' + m[1] : '';
      }

      const brandList = Store.getList('brand').map(b => b.toUpperCase());
      const brand = (parsed.brand || '').toUpperCase();
      const validBrand = brandList.includes(brand) ? brand : '';

      return {
        lotNumber: lot,
        brand: validBrand,
        bestBefore: parsed.bestBefore || '',
        confidence: parsed.confidence || { lot: 85, brand: 85, bbd: 85 },
        source: 'openai'
      };
    } catch (err) {
      console.error('OpenAI Vision extraction error:', err);
      throw err;
    }
  }

  return { extract, extractFromImage, extractFromImageOpenAI };
})();


/* ===== scanner.js ===== */
/**
 * scanner.js — Orchestrates capture → OCR → LLM → field population
 */
const Scanner = (() => {
  let isProcessing = false;

  function init() {
    document.getElementById('capture-btn').addEventListener('click', handleCapture);
    document.getElementById('add-scan-btn').addEventListener('click', handleAddScan);
    document.getElementById('clear-fields-btn').addEventListener('click', clearFields);

    // Enable add button when lot is filled
    ['field-lot', 'field-brand', 'field-bbd'].forEach(id => {
      document.getElementById(id).addEventListener('input', validateFields);
      document.getElementById(id).addEventListener('change', validateFields);
    });
  }

  async function handleCapture() {
    if (isProcessing) return;
    isProcessing = true;

    // Shutter flash — confirms a still photo was taken (OCR runs on this frame, not live video)
    const viewport = document.getElementById('camera-viewport');
    const flash = document.createElement('div');
    flash.className = 'camera-flash';
    viewport.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });

    const captureBtn = document.getElementById('capture-btn');
    captureBtn.classList.add('capturing');
    Camera.setStatus('reading', 'Capturing…');

    try {
      // 1. Capture frame
      const canvas = Camera.captureFrame();
      if (!canvas) {
        Camera.setStatus('error', 'No camera feed');
        return;
      }

      // Debug: show captured frame
      const dbgCapture = document.getElementById('ocr-debug-capture');
      if (dbgCapture) { dbgCapture.src = canvas.toDataURL('image/jpeg', 0.85); dbgCapture.style.display = 'block'; }

      const enginePref = Store.getOcrEngine(); // 'auto'|'gemini'|'openai'|'paddle'|'tesseract'

      // 2a. OpenAI Vision
      const useOpenAI = enginePref === 'openai' || (enginePref === 'auto' && Store.getOpenAiKey() && !Store.getApiKey());
      if (useOpenAI && Store.getOpenAiKey()) {
        Camera.setStatus('reading', 'Reading with GPT-4.1 Mini…');
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const visionResult = await LLM.extractFromImageOpenAI(dataUrl);
          if (visionResult && (visionResult.lotNumber || visionResult.brand || visionResult.bestBefore)) {
            const preview = [
              visionResult.lotNumber  && `Lot: ${visionResult.lotNumber}`,
              visionResult.brand      && `Brand: ${visionResult.brand}`,
              visionResult.bestBefore && `BBD: ${visionResult.bestBefore}`
            ].filter(Boolean).join('\n');
            _showRawOCR(preview, 'vision');
            populateFields(visionResult);
            checkDuplicate();
            const fieldsFound = [visionResult.lotNumber, visionResult.brand, visionResult.bestBefore].filter(Boolean).length;
            Camera.setStatus('ready', `Extracted ${fieldsFound}/3 fields (GPT-4.1 Mini)`);
            return;
          }
        } catch (err) {
          console.warn('OpenAI Vision failed:', err.message);
          if (enginePref === 'openai') {
            Camera.setStatus('error', `OpenAI Vision failed — ${err.message}`);
            return;
          }
        }
        if (enginePref === 'openai') {
          Camera.setStatus('error', 'OpenAI returned no data — check API key in settings');
          return;
        }
      }

      // 2b. Gemini Vision — used when engine is 'gemini' (forced) or 'auto' with API key.
      //    Necessary because Tesseract's LSTM misreads dot-matrix fonts systematically.
      const useGemini = enginePref === 'gemini' || (enginePref === 'auto' && Store.getApiKey());
      if (useGemini && Store.getApiKey()) {
        Camera.setStatus('reading', 'Reading with Gemini AI…');
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const visionResult = await LLM.extractFromImage(dataUrl);
          if (visionResult && (visionResult.lotNumber || visionResult.brand || visionResult.bestBefore)) {
            const preview = [
              visionResult.lotNumber  && `Lot: ${visionResult.lotNumber}`,
              visionResult.brand      && `Brand: ${visionResult.brand}`,
              visionResult.bestBefore && `BBD: ${visionResult.bestBefore}`
            ].filter(Boolean).join('\n');
            _showRawOCR(preview, 'vision');
            populateFields(visionResult);
            checkDuplicate();
            const fieldsFound = [visionResult.lotNumber, visionResult.brand, visionResult.bestBefore].filter(Boolean).length;
            Camera.setStatus('ready', `Extracted ${fieldsFound}/3 fields (Gemini AI)`);
            return;
          }
        } catch (err) {
          console.warn('Gemini Vision failed:', err.message);
          if (enginePref === 'gemini') {
            const msg = err.message.includes('Failed to fetch')
              ? 'Gemini Vision failed — CORS or network error (endpoint may block browser requests)'
              : `Gemini Vision failed — ${err.message}`;
            Camera.setStatus('error', msg);
            return;
          }
        }
        if (enginePref === 'gemini') {
          Camera.setStatus('error', 'Gemini returned no data — check endpoint and API key in settings');
          return;
        }
      }

      // 2c. Google Cloud Vision OCR → raw text → LLM.extract()
      const useGCV = enginePref === 'gcv' || (enginePref === 'auto' && Store.getGcvKey() && !Store.getApiKey() && !Store.getOpenAiKey());
      if (useGCV && Store.getGcvKey()) {
        Camera.setStatus('reading', 'Reading with Cloud Vision…');
        try {
          const gcvResult = await OCR.recognizeGCV(canvas);
          _showRawOCR(gcvResult.text, 'gcv');
          if (gcvResult.text) {
            Camera.setStatus('reading', 'Extracting fields…');
            const extracted = await LLM.extract(gcvResult.text);
            populateFields(extracted);
            checkDuplicate();
            const fieldsFound = [extracted.lotNumber, extracted.brand, extracted.bestBefore].filter(Boolean).length;
            Camera.setStatus('ready', `Extracted ${fieldsFound}/3 fields (Cloud Vision)`);
            return;
          }
        } catch (err) {
          console.warn('GCV failed:', err.message);
          if (enginePref === 'gcv') {
            Camera.setStatus('error', `Cloud Vision failed — ${err.message}`);
            return;
          }
        }
        if (enginePref === 'gcv') {
          Camera.setStatus('error', 'Cloud Vision returned no text — check API key in settings');
          return;
        }
      }

      // 3. Tesseract OCR — offline fallback (no API key required)
      Camera.setStatus('reading', 'Running OCR…');
      const ocrResult = await OCR.recognize(canvas);

      if (ocrResult.status === 'error') {
        Camera.setStatus('error', 'OCR error — try again');
        return;
      }

      // Show raw OCR output + engine name for transparency
      _showRawOCR(ocrResult.text, ocrResult.engine);
      // Prepend engine/confidence to the existing canvas/bands debug text
      const _dbgEl = document.getElementById('ocr-debug-info');
      if (_dbgEl) {
        const _conf = ocrResult.confidence ? `Conf: ${ocrResult.confidence}%` : '';
        const _existing = _dbgEl.textContent ? '\n' + _dbgEl.textContent : '';
        _dbgEl.textContent = `Engine: ${ocrResult.engine}  ${_conf}${_existing}`;
      }

      if (!ocrResult.text) {
        Camera.setStatus('error', 'No text detected — reposition label');
        return;
      }

      // 4. Extract fields from Tesseract text (regex + fuzzy matching)
      Camera.setStatus('reading', 'Extracting fields…');
      const extracted = await LLM.extract(ocrResult.text);

      // 5. Populate fields
      populateFields(extracted);

      // 6. Check duplicate
      checkDuplicate();

      const fieldsFound = [extracted.lotNumber, extracted.brand, extracted.bestBefore].filter(Boolean).length;
      Camera.setStatus('ready', fieldsFound > 0 ? `Extracted ${fieldsFound}/3 fields` : 'No fields matched — check raw text');
    } catch (err) {
      console.error('Scan error:', err);
      Camera.setStatus('error', 'Scan failed');
    } finally {
      isProcessing = false;
      captureBtn.classList.remove('capturing');
    }
  }

  function populateFields(data) {
    const lotEl = document.getElementById('field-lot');
    const brandEl = document.getElementById('field-brand');
    const bbdEl = document.getElementById('field-bbd');
    const kegEl = document.getElementById('field-kegsize');

    if (data.lotNumber) lotEl.value = data.lotNumber;
    if (data.brand) {
      // Try to match brand in dropdown
      const options = Array.from(brandEl.options).map(o => o.value);
      const match = options.find(o => o.toLowerCase() === data.brand.toLowerCase());
      brandEl.value = match || '';
      if (!match && data.brand) {
        // Add as option temporarily
        const opt = document.createElement('option');
        opt.value = data.brand;
        opt.textContent = data.brand + ' (detected)';
        opt.selected = true;
        brandEl.appendChild(opt);
      }
    }
    if (data.bestBefore) bbdEl.value = data.bestBefore;

    // Set default keg size from session
    const session = Store.getSession();
    if (session && session.kegSize && !kegEl.value) {
      kegEl.value = session.kegSize;
    }

    // Set confidence indicators
    if (data.confidence) {
      _setConfidence('conf-lot', data.confidence.lot);
      _setConfidence('conf-brand', data.confidence.brand);
      _setConfidence('conf-bbd', data.confidence.bbd);
    }

    validateFields();
  }

  function _setConfidence(id, score) {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.className = 'confidence-dot';
    if (score >= 70) dot.classList.add('high');
    else if (score >= 40) dot.classList.add('medium');
    else dot.classList.add('low');
    dot.title = `Confidence: ${score}%`;
  }

  function checkDuplicate() {
    const lot = document.getElementById('field-lot').value.trim();
    const warning = document.getElementById('duplicate-warning');
    const isDup = lot && Store.isDuplicate(lot);
    warning.classList.toggle('hidden', !isDup);
    validateFields(); // re-evaluate button state when duplicate status changes
  }

  function validateFields() {
    const lot   = document.getElementById('field-lot').value.trim();
    const brand = document.getElementById('field-brand').value;
    const bbd   = document.getElementById('field-bbd').value;
    const isDup = lot && Store.isDuplicate(lot);
    const btn   = document.getElementById('add-scan-btn');
    const hint  = document.getElementById('field-hint');
    const allFilled = !!(lot && brand && bbd);
    btn.disabled = !(allFilled && !isDup);
    document.getElementById('duplicate-warning').classList.toggle('hidden', !isDup);
    if (isDup) {
      hint.classList.add('hidden');
    } else if (!allFilled) {
      const missing = [];
      if (!lot)   missing.push('Lot Number');
      if (!brand) missing.push('Brand');
      if (!bbd)   missing.push('Best Before date');
      hint.textContent = 'Required: ' + missing.join(', ') + '.';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }

  function handleAddScan() {
    const lot     = document.getElementById('field-lot').value.trim();
    const brand   = document.getElementById('field-brand').value;
    const bbd     = document.getElementById('field-bbd').value;
    const kegSize = document.getElementById('field-kegsize').value;

    if (!lot || !brand || !bbd) return;
    if (Store.isDuplicate(lot)) { _toast('Duplicate lot — already scanned', 'error'); return; }

    const keg = Store.addKeg({
      lotNumber: lot,
      brand:     brand,
      bestBefore: bbd,
      kegSize:   kegSize
    });

    clearFields();
    Table.render();
    updateCounter();
    _toast('Keg added ✓', 'success');
  }

  function clearFields() {
    document.getElementById('field-lot').value = '';
    document.getElementById('field-brand').value = '';
    document.getElementById('field-bbd').value = '';

    // Reset keg size to session default
    const session = Store.getSession();
    const kegEl = document.getElementById('field-kegsize');
    if (session) kegEl.value = session.kegSize || '';

    // Reset confidence dots
    ['conf-lot', 'conf-brand', 'conf-bbd'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'confidence-dot';
    });

    document.getElementById('duplicate-warning').classList.add('hidden');
    document.getElementById('field-hint').classList.add('hidden');
    document.getElementById('add-scan-btn').disabled = true;
    const rawWrap = document.querySelector('.ocr-raw-wrap');
    if (rawWrap) rawWrap.classList.add('hidden');
  }

  function updateCounter() {
    const session = Store.getSession();
    if (!session) return;
    const count = session.kegs ? session.kegs.length : 0;
    const target = session.targetCount || 0;

    document.getElementById('scanned-count').textContent = count;

    // Show " / N" only when a target is set
    const sep = document.getElementById('target-sep');
    const tgt = document.getElementById('target-display');
    if (target > 0) {
      if (sep) sep.style.display = '';
      if (tgt) tgt.textContent = target;
    } else {
      if (sep) sep.style.display = 'none';
      if (tgt) tgt.textContent = '';
    }

    // Progress ring
    const pct = target > 0 ? Math.min(count / target, 1) : 0;
    const circumference = 2 * Math.PI * 20; // r=20
    const offset = circumference * (1 - pct);
    const ring = document.getElementById('progress-ring-fill');
    ring.style.strokeDashoffset = offset;

    // When no target: show green ring (full) with no percentage text
    const counterVal = document.querySelector('.counter-value');
    if (target > 0) {
      let color = 'var(--red)';
      if (pct >= 1) color = 'var(--green)';
      else if (pct >= 0.5) color = 'var(--orange)';
      ring.style.stroke = color;
      ring.style.strokeDashoffset = offset;
      if (counterVal) counterVal.style.color = color;
      document.getElementById('progress-pct').textContent = Math.round(pct * 100) + '%';
    } else {
      ring.style.stroke = 'var(--green)';
      ring.style.strokeDashoffset = circumference; // empty ring when no target
      if (counterVal) counterVal.style.color = 'var(--green)';
      document.getElementById('progress-pct').textContent = '';
    }
  }

  function _showRawOCR(text, engine) {
    const el = document.getElementById('ocr-raw-text');
    if (!el) return;
    const label = { azure: 'Azure AI Vision', paddle: 'PaddleOCR', native: 'Native ML', tesseract: 'Tesseract', vision: 'Gemini Vision', none: 'None' }[engine] || engine || '';
    el.textContent = text ? text.trim() : '(empty)';
    const wrap = el.closest('.ocr-raw-wrap');
    const title = wrap.querySelector('.ocr-raw-title');
    if (title && label) title.textContent = `Raw OCR (${label})`;
    wrap.classList.toggle('hidden', !text);
  }

  function _toast(message, type) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  return { init, updateCounter, clearFields, _toast };
})();


/* ===== table.js ===== */
const Table = (() => {
  let editingId = null;
  let _listenerBound = false;

  function render() {
    const kegs = Store.getKegs();
    const session = Store.getSession();
    const tbody = document.getElementById('kegs-tbody');
    const empty = document.getElementById('table-empty');
    const countEl = document.getElementById('table-count');

    // Session-level values shared across all rows
    const truck = session ? _esc(session.truckNumber) : '—';
    const sDate = session ? (session.date || '—') : '—';
    const shipTo = session ? _esc(session.shipTo) : '—';

    countEl.textContent = kegs.length + ' keg' + (kegs.length !== 1 ? 's' : '');

    if (kegs.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = kegs.map((k, i) => {
      const time = new Date(k.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const statusClass = k.status === 'edited' ? 'edited' : 'ok';
      const statusLabel = k.status === 'edited' ? 'Edited' : 'OK';

      if (editingId === k.id) {
        return `<tr class=”editing-row”>
          <td>${i + 1}</td>
          <td><span class=”status-badge ${statusClass}”>${statusLabel}</span></td>
          <td>${sDate}</td>
          <td>${time}</td>
          <td>${truck}</td>
          <td>${shipTo}</td>
          <td><input type=”text” class=”edit-input” id=”edit-lot-${k.id}” value=”${_esc(k.lotNumber)}”></td>
          <td><input type=”text” class=”edit-input” id=”edit-brand-${k.id}” value=”${_esc(k.brand)}”></td>
          <td><input type=”date” class=”edit-input” id=”edit-bbd-${k.id}” value=”${k.bestBefore}”></td>
          <td><input type=”text” class=”edit-input” id=”edit-ks-${k.id}” value=”${_esc(k.kegSize)}”></td>
          <td class=”row-actions”>
            <button class=”row-btn save” data-id=”${k.id}”>Save</button>
            <button class=”row-btn cancel” data-id=”${k.id}”>Cancel</button>
          </td>
        </tr>`;
      }

      return `<tr>
        <td>${i + 1}</td>
        <td><span class=”status-badge ${statusClass}”>${statusLabel}</span></td>
        <td>${sDate}</td>
        <td>${time}</td>
        <td>${truck}</td>
        <td>${shipTo}</td>
        <td>${_esc(k.lotNumber)}</td>
        <td>${_esc(k.brand)}</td>
        <td>${k.bestBefore || '—'}</td>
        <td>${_esc(k.kegSize)}</td>
        <td class=”row-actions”>
          <button class=”row-btn edit” data-id=”${k.id}”>Edit</button>
          <button class=”row-btn delete” data-id=”${k.id}”>Del</button>
        </td>
      </tr>`;
    }).join('');

    // Single delegated listener on tbody — survives every innerHTML re-set, icons come from CSS
    if (!_listenerBound) {
      _listenerBound = true;
      tbody.addEventListener('click', function(e) {
        const btn = e.target.closest('.row-btn');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('edit'))   { editingId = id; render(); }
        if (btn.classList.contains('delete')) { Store.deleteKeg(id); render(); Scanner.updateCounter(); Scanner._toast('Keg removed', 'info'); }
        if (btn.classList.contains('save'))   { _saveEdit(id); }
        if (btn.classList.contains('cancel')) { editingId = null; render(); }
      });
    }
  }

  function _saveEdit(id) {
    const lot = document.getElementById('edit-lot-' + id)?.value.trim();
    const brand = document.getElementById('edit-brand-' + id)?.value.trim();
    const bbd = document.getElementById('edit-bbd-' + id)?.value;
    const ks = document.getElementById('edit-ks-' + id)?.value.trim();
    Store.updateKeg(id, { lotNumber: lot, brand: brand, bestBefore: bbd, kegSize: ks });
    editingId = null;
    render();
    Scanner._toast('Keg updated', 'success');
  }

  function _esc(str) {
    if (!str) return '—';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { render };
})();


/* ===== auth.js ===== */
const Auth = (() => {
  const CLIENT_ID = '9e468756-11d6-45a0-95b4-8f10d98736a6';
  const TENANT_ID = '66e853de-ece3-44dd-9d66-ee6bdf4159d4';
  const SCOPES    = ['https://graph.microsoft.com/Sites.ReadWrite.All'];

  let _app     = null;
  let _account = null;

  async function init() {
    const redirectUri = window.location.origin + window.location.pathname;
    _dbg('redirect', redirectUri);
    _dbg('status', 'Initializing…');

    if (typeof msal === 'undefined') {
      const msg = 'MSAL library not loaded. Check that msal-browser.min.js was uploaded.';
      console.error('[Auth]', msg);
      _dbg('status', 'FAIL — ' + msg);
      _dbg('error', msg);
      _updateUI();
      return;
    }
    _dbg('msal-ver', 'MSAL v2 loaded OK');

    try {
      // MSAL v2 — no initialize() call needed
      _app = new msal.PublicClientApplication({
        auth: {
          clientId:    CLIENT_ID,
          authority:   'https://login.microsoftonline.com/' + TENANT_ID,
          redirectUri: redirectUri
        },
        cache: {
          cacheLocation:          'sessionStorage',
          storeAuthStateInCookie: false
        },
        system: {
          loggerOptions: {
            logLevel: msal.LogLevel.Warning,
            loggerCallback: (lvl, msg) => console.warn('[MSAL]', msg)
          }
        }
      });

      _dbg('status', 'MSAL app created — handling redirect…');

      const redirectResult = await _app.handleRedirectPromise();
      if (redirectResult) {
        _account = redirectResult.account;
        _dbg('status', 'Signed in via redirect: ' + _account.username);
      } else {
        const accounts = _app.getAllAccounts();
        if (accounts.length > 0) {
          _account = accounts[0];
          _dbg('status', 'Restored session: ' + _account.username);
        } else {
          _dbg('status', 'Ready — not signed in');
        }
      }

    } catch (err) {
      const detail = (err.errorCode ? err.errorCode + ': ' : '') + (err.message || String(err));
      console.error('[Auth] init() failed:', err);
      _dbg('status', 'FAIL — ' + detail);
      _dbg('error', detail);
      _app = null;
    }

    _updateUI();
  }

  async function login() {
    if (!_app) {
      Scanner._toast('Auth not ready — see debug panel on home screen.', 'error');
      return false;
    }
    try {
      const result = await _app.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
      _account = result.account;
      _dbg('status', 'Signed in: ' + _account.username);
      _updateUI();
      return true;
    } catch (err) {
      if (err.errorCode !== 'user_cancelled') {
        const detail = (err.errorCode ? err.errorCode + ': ' : '') + (err.message || '');
        console.error('[Auth] login() failed:', err);
        _dbg('error', detail);
        Scanner._toast('Sign in failed: ' + detail, 'error');
      }
      return false;
    }
  }

  async function logout() {
    if (!_app || !_account) return;
    try { await _app.logoutPopup({ account: _account }); } catch {}
    _account = null;
    _dbg('status', 'Signed out');
    _updateUI();
  }

  async function getToken() {
    if (!_app)     throw new Error('Auth not ready — see debug panel.');
    if (!_account) throw new Error('Not signed in to Microsoft.');
    try {
      const r = await _app.acquireTokenSilent({ scopes: SCOPES, account: _account });
      return r.accessToken;
    } catch {
      const r = await _app.acquireTokenPopup({ scopes: SCOPES });
      _account = r.account;
      return r.accessToken;
    }
  }

  function isSignedIn()  { return !!_account; }
  function isConfigured(){ return !!_app; }

  function _dbg(field, value) {
    console.log('[Auth]', field, '→', value);
    const el = document.getElementById('auth-dbg-' + field);
    if (el) el.textContent = value;
  }

  function _updateUI() {
    const authed = !!_account;
    document.querySelectorAll('.when-authed').forEach(el  => el.classList.toggle('hidden', !authed));
    document.querySelectorAll('.when-unauthed').forEach(el => el.classList.toggle('hidden',  authed));

    if (authed) {
      const rawName  = _account.name || _account.username.split('@')[0];
      const initials = rawName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
      document.querySelectorAll('.auth-user-name').forEach(el     => el.textContent = rawName);
      document.querySelectorAll('.auth-user-initials').forEach(el => el.textContent = initials);
    }
  }

  return { init, login, logout, getToken, isSignedIn, isConfigured };
})();


/* ===== sharepoint.js ===== */
const SharePoint = (() => {
  const GRAPH        = 'https://graph.microsoft.com/v1.0';
  const SP_HOSTNAME  = 'heiway.sharepoint.com';
  const SP_SITE_PATH = '/sites/HEINEKENMyanmar';
  const SP_LIBRARY   = 'DataP';
  const SP_BASE_DIR  = 'JDE/15_RPM/002_Circulation_App_Test';

  // Upload (or update) keg rows to the monthly SharePoint Excel file.
  // Existing rows for the same truck+date are replaced; all others are kept.
  async function submitSession(session, kegs) {
    const token = await Auth.getToken();

    // 1 – Resolve site
    const site = await _get(token, `/sites/${SP_HOSTNAME}:${SP_SITE_PATH}`);
    const siteId = site.id;

    // 2 – Resolve DataP document library drive
    const drivesRes = await _get(token, `/sites/${siteId}/drives`);
    const drive = drivesRes.value.find(d => d.name === SP_LIBRARY);
    if (!drive) throw new Error(`Document library "${SP_LIBRARY}" not found on this SharePoint site.`);
    const driveId = drive.id;

    // 3 – Build target path
    const date = new Date(session.date + 'T00:00:00');
    const year  = String(date.getFullYear());
    const month = date.toLocaleString('en-US', { month: 'long' }); // e.g. "May"
    const fileName   = `${month} ${year} Keg Circulation.xlsx`;
    const folderPath = `${SP_BASE_DIR}/${year}/${month}`;
    const filePath   = `${folderPath}/${fileName}`;

    // 4 – Ensure year/month folders exist
    await _ensureFolder(token, siteId, driveId, `${SP_BASE_DIR}/${year}`);
    await _ensureFolder(token, siteId, driveId, folderPath);

    // 5 – Try to load existing file and merge (replace same truck+date rows)
    let existingRows = [];
    try {
      const resp = await fetch(
        `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${filePath}:/content`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        existingRows = XLSX.utils.sheet_to_json(ws);
      }
    } catch {}

    const truckKey = `${session.truckNumber}||${session.date}`;
    const kept     = existingRows.filter(r =>
      `${r['Truck Number']}||${r['Date']}` !== truckKey
    );

    const newRows = kegs.map(k => ({
      'Date':         session.date       || '',
      'Truck Number': session.truckNumber || '',
      'Ship To':      session.shipTo      || '',
      'Lot Number':   k.lotNumber         || '',
      'Best Before':  k.bestBefore        || '',
      'Keg Size':     k.kegSize           || '',
      'Brand':        k.brand             || '',
      'Scan Time':    k.timestamp
        ? new Date(k.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : ''
    }));

    const merged = [...kept, ...newRows];

    // 6 – Build Excel buffer
    const ws = XLSX.utils.json_to_sheet(merged);
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
      { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kegs');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    // 7 – Upload (PUT = upsert)
    const uploadUrl = `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${filePath}:/content`;
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      body: new Uint8Array(buffer)
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Upload failed (HTTP ${uploadResp.status})`);
    }

    return { fileName, folderPath, totalRows: merged.length };
  }

  async function _ensureFolder(token, siteId, driveId, folderPath) {
    const parts      = folderPath.split('/');
    const folderName = parts.pop();
    const parentPath = parts.join('/');

    const url = `${GRAPH}/sites/${siteId}/drives/${driveId}/root:/${parentPath}:/children`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      })
    });
    // 201 = created, 409 = already exists — both are fine
    if (!resp.ok && resp.status !== 409) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Folder creation failed (HTTP ${resp.status})`);
    }
  }

  async function _get(token, path) {
    const resp = await fetch(`${GRAPH}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Request failed (HTTP ${resp.status})`);
    }
    return resp.json();
  }

  return { submitSession };
})();


/* ===== synapse.js ===== */
const Synapse = (() => {

  async function submitSession(session, kegs, submittedBy) {
    const url = Store.getVercelUrl();
    if (!url) throw new Error('Synapse endpoint not configured — add Vercel URL in settings');

    const truck   = (session.truckNumber || '').replace(/\//g, '_');
    const date    = session.date || new Date().toISOString().slice(0, 10);
    const batchId = `${truck}_${date}`;

    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          date:        session.date,
          truckNumber: session.truckNumber,
          shipTo:      session.shipTo,
          kegSize:     session.kegSize,
          type:        session.type || 'keg',
        },
        kegs: kegs.map(k => ({
          lotNumber:  k.lotNumber,
          brand:      k.brand,
          bestBefore: k.bestBefore,
          timestamp:  k.timestamp,
          kegSize:    k.kegSize,
        })),
        submittedBy: submittedBy || 'KegScanApp',
        batchId,
      }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  return { submitSession };
})();


/* ===== export.js ===== */
const Export = (() => {

  function init() {
    document.getElementById('finish-truck-btn').addEventListener('click', handleSubmit);
  }

  async function handleSubmit() {
    const session = Store.getSession();
    if (!session) return;

    const kegs = session.kegs || [];
    if (kegs.length === 0) {
      Scanner._toast('No kegs to submit', 'error');
      return;
    }

    const target = session.targetCount || 0;
    if (target > 0 && kegs.length < target) {
      const proceed = confirm(
        `You have scanned ${kegs.length} of ${target} kegs.\nSubmit anyway?`
      );
      if (!proceed) return;
    }

    if (!confirm(
      `Submit ${kegs.length} keg${kegs.length !== 1 ? 's' : ''} for truck ${session.truckNumber}?\n\nData will be saved to Azure Synapse and SharePoint.`
    )) return;

    // Get signed-in user name for audit column (best-effort)
    const submittedBy = document.querySelector('.auth-user-name')?.textContent?.trim() || 'KegScanApp';

    // ── Step 1: Azure Synapse (via Vercel) ─────────────────────────────────
    if (Store.getVercelUrl()) {
      _setLoading(true, 'Inserting into Azure Synapse…');
      try {
        const { inserted } = await Synapse.submitSession(session, kegs, submittedBy);
        console.log(`Synapse: ${inserted} rows inserted`);
      } catch (err) {
        _setLoading(false);
        console.error('Synapse submit failed:', err);
        const proceed = confirm(
          `Azure Synapse insert failed:\n${err.message}\n\nContinue to SharePoint anyway?`
        );
        if (!proceed) return;
      }
    }

    // ── Step 2: SharePoint ─────────────────────────────────────────────────
    if (!Auth.isSignedIn()) {
      Scanner._toast('Signing in to Microsoft 365…', 'info');
      const ok = await Auth.login();
      if (!ok) { _setLoading(false); return; }
    }

    _setLoading(true, 'Uploading to SharePoint…');

    try {
      await SharePoint.submitSession(session, kegs);
      _setLoading(false);
      Scanner._toast(
        `${kegs.length} keg${kegs.length !== 1 ? 's' : ''} submitted ✓`,
        'success'
      );
      setTimeout(() => {
        document.getElementById('back-btn').click();
      }, 1800);

    } catch (err) {
      _setLoading(false);
      console.error('SharePoint submit failed:', err);
      const fallback = confirm(
        `SharePoint upload failed:\n${err.message}\n\nDownload Excel file locally instead?`
      );
      if (fallback) _downloadExcel(session, kegs);
    }
  }

  function _setLoading(on, message) {
    const overlay = document.getElementById('submit-loading-overlay');
    if (on) {
      overlay.querySelector('.loading-message').textContent = message || '';
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  function _downloadExcel(session, kegs) {
    const rows = kegs.map(k => ({
      'Date':         session.date        || '',
      'Truck Number': session.truckNumber  || '',
      'Ship To':      session.shipTo       || '',
      'Lot Number':   k.lotNumber          || '',
      'Best Before':  k.bestBefore         || '',
      'Keg Size':     k.kegSize            || '',
      'Brand':        k.brand              || '',
      'Scan Time':    k.timestamp
        ? new Date(k.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
      { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 10 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kegs');

    const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = `Kegs_${session.truckNumber}_${session.date}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init };
})();


/* ===== app.js ===== */
(function App() {
  document.addEventListener('DOMContentLoaded', async () => {
    Store.init();
    Admin.init();
    Camera.init();
    CropSelector.init();
    Scanner.init();
    Export.init();
    Admin.populateDropdowns();

    // Initialize Azure AD SSO
    await Auth.init();

    const dateInput = document.getElementById('session-date');
    dateInput.value = new Date().toISOString().split('T')[0];

    // ===== MICROSOFT SIGN-IN =====
    document.getElementById('signin-btn').addEventListener('click', async () => {
      await Auth.login();
    });
    document.getElementById('signout-btn').addEventListener('click', async () => {
      await Auth.logout();
    });

    // ===== TYPE SELECTOR =====
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) {
          Scanner._toast('Bottle scanning - coming soon!', 'info');
          return;
        }
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    function getSelectedType() {
      const sel = document.querySelector('.type-btn.selected');
      return sel ? sel.dataset.type : 'keg';
    }

    // ===== SHIP TO COMBOBOX =====
    // Dropdown is appended to <body> with position:fixed to avoid being
    // clipped by the modal card's overflow-y:auto scroll container.
    (function initShipToCombobox() {
      const searchInput = document.getElementById('ship-to-search');
      const hiddenInput = document.getElementById('ship-to');
      const combobox    = document.getElementById('shipto-combobox');
      if (!searchInput) return;

      // Create dropdown in body so it isn't clipped by modal overflow
      const dropdown = document.createElement('div');
      dropdown.className = 'shipto-dropdown hidden';
      document.body.appendChild(dropdown);

      function position() {
        const r = searchInput.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top      = (r.bottom + 4) + 'px';
        dropdown.style.left     = r.left + 'px';
        dropdown.style.width    = r.width + 'px';
        dropdown.style.zIndex   = '9999';
      }

      function open(filter) {
        const items = Store.getList('shipTo');
        const q = (filter || '').toLowerCase().trim();
        const filtered = q ? items.filter(i => i.toLowerCase().includes(q)) : items;
        dropdown.innerHTML = filtered.length === 0
          ? '<div class="shipto-no-results">No matches found</div>'
          : filtered.map(item =>
              `<div class="shipto-option" data-value="${item.replace(/"/g,'&quot;')}">${item}</div>`
            ).join('');
        dropdown.querySelectorAll('.shipto-option').forEach(opt => {
          opt.addEventListener('mousedown', (e) => {
            e.preventDefault();
            hiddenInput.value = opt.dataset.value;
            searchInput.value = opt.dataset.value;
            if (combobox) combobox.classList.remove('shipto-input-error');
            dropdown.classList.add('hidden');
          });
        });
        position();
        dropdown.classList.remove('hidden');
      }

      function close() { dropdown.classList.add('hidden'); }

      searchInput.addEventListener('focus',  () => open(searchInput.value));
      searchInput.addEventListener('input',  () => { hiddenInput.value = ''; open(searchInput.value); });
      searchInput.addEventListener('blur',   () => setTimeout(close, 200));
      searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); searchInput.blur(); } });
      window.addEventListener('scroll', () => { if (!dropdown.classList.contains('hidden')) position(); }, true);
      window.addEventListener('resize', () => { if (!dropdown.classList.contains('hidden')) position(); });
    })();

    // ===== SESSION FORM =====
    document.getElementById('session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const scannerType = getSelectedType();

      // Validate Ship To (hidden input required since HTML won't validate it)
      const shipToVal = document.getElementById('ship-to').value;
      if (!shipToVal) {
        const combobox = document.getElementById('shipto-combobox');
        if (combobox) combobox.classList.add('shipto-input-error');
        document.getElementById('ship-to-search').focus();
        return;
      }

      const session = {
        scannerType,
        date:         document.getElementById('session-date').value,
        truckNumber:  document.getElementById('truck-number').value.trim(),
        shipTo:       shipToVal,
        kegSize:      document.getElementById('keg-size').value,
        targetCount:  parseInt(document.getElementById('target-count').value) || 0,
        scannedCount: 0,
        kegs:         []
      };

      Store.setSession(session);

      document.getElementById('hdr-type').textContent   = scannerType.toUpperCase();
      document.getElementById('hdr-date').textContent   = session.date;
      document.getElementById('hdr-truck').textContent  = session.truckNumber;
      document.getElementById('hdr-shipto').textContent = session.shipTo;

      Admin.populateDropdowns();
      document.getElementById('field-kegsize').value = session.kegSize;

      document.getElementById('setup-modal').classList.remove('active');
      document.getElementById('app').classList.remove('hidden');

      await Camera.start();
      await OCR.init();

      Scanner.updateCounter();
      Table.render();
    });

    // ===== BACK BUTTON =====
    document.getElementById('back-btn').addEventListener('click', () => {
      Camera.stop();

      const session = Store.getSession();
      Admin.populateDropdowns();
      if (session) {
        document.getElementById('session-date').value  = session.date        || '';
        document.getElementById('truck-number').value  = session.truckNumber || '';
        document.getElementById('ship-to').value       = session.shipTo      || '';
        const srch = document.getElementById('ship-to-search');
        if (srch) srch.value = session.shipTo || '';
        document.getElementById('keg-size').value      = session.kegSize     || '';
        document.getElementById('target-count').value  = session.targetCount || '';

        document.querySelectorAll('.type-btn').forEach(btn => {
          btn.classList.remove('selected');
          if (btn.dataset.type === (session.scannerType || 'keg')) btn.classList.add('selected');
        });
      }

      document.getElementById('app').classList.add('hidden');
      document.getElementById('setup-modal').classList.add('active');
    });

    // ===== OPEN ADMIN FROM SETUP SCREEN =====
    document.getElementById('open-admin-btn').addEventListener('click', () => {
      document.getElementById('admin-modal').classList.add('active');
      Admin.renderAll();
    });

    // ===== CAMERA SWITCH =====
    document.getElementById('switch-camera-btn').addEventListener('click', () => {
      Camera.switchCamera();
    });

    // ===== SETTINGS FAB =====
    const fab     = document.getElementById('settings-fab');
    const fabMenu = document.getElementById('fab-menu');
    fab.addEventListener('click', () => { fabMenu.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => {
      if (!fab.contains(e.target) && !fabMenu.contains(e.target)) {
        fabMenu.classList.add('hidden');
      }
    });

    document.getElementById('fab-apikey').addEventListener('click', () => {
      fabMenu.classList.add('hidden');
      document.getElementById('gemini-key-input').value      = Store.getApiKey();
      const storedEndpoint = localStorage.getItem('keg_gemini_endpoint') || '';
      document.getElementById('gemini-endpoint-input').value = storedEndpoint;
      document.getElementById('openai-key-input').value      = Store.getOpenAiKey();
      document.getElementById('gcv-key-input').value         = Store.getGcvKey();
      document.getElementById('vercel-url-input').value      = Store.getVercelUrl();
      document.getElementById('paddle-url-input').value      = Store.getPaddleUrl();
      document.getElementById('azure-endpoint-input').value = Store.getAzureEndpoint();
      document.getElementById('apikey-input').value         = Store.getAzureKey();
      _updateOcrStatuses();
      document.getElementById('apikey-modal').classList.add('active');
    });

    document.getElementById('fab-admin').addEventListener('click', () => {
      fabMenu.classList.add('hidden');
      document.getElementById('admin-modal').classList.add('active');
      Admin.renderAll();
    });

    document.getElementById('fab-new-session').addEventListener('click', () => {
      fabMenu.classList.add('hidden');
      if (confirm('Start a new session? Current data will remain until submitted.')) {
        Camera.stop();
        document.getElementById('app').classList.add('hidden');
        document.getElementById('setup-modal').classList.add('active');
        Admin.populateDropdowns();
      }
    });

    document.getElementById('fab-signout').addEventListener('click', async () => {
      fabMenu.classList.add('hidden');
      await Auth.logout();
    });

    // ===== OCR SETTINGS MODAL =====
    function _updateOcrStatuses() {
      const gEl = document.getElementById('gemini-status');
      if (gEl) {
        const hasGemini = !!Store.getApiKey();
        gEl.textContent = hasGemini ? 'Configured' : 'Not configured';
        gEl.className   = 'settings-status ' + (hasGemini ? 'active' : 'inactive');
      }
      const oEl = document.getElementById('openai-status');
      if (oEl) {
        const hasOpenAI = !!Store.getOpenAiKey();
        oEl.textContent = hasOpenAI ? 'Configured' : 'Not configured';
        oEl.className   = 'settings-status ' + (hasOpenAI ? 'active' : 'inactive');
      }
      const gcvEl = document.getElementById('gcv-status');
      if (gcvEl) {
        const hasGCV = !!Store.getGcvKey();
        gcvEl.textContent = hasGCV ? 'Configured' : 'Not configured';
        gcvEl.className   = 'settings-status ' + (hasGCV ? 'active' : 'inactive');
      }
      const synEl = document.getElementById('synapse-status');
      if (synEl) {
        const hasVercel = !!Store.getVercelUrl();
        synEl.textContent = hasVercel ? 'Configured' : 'Not configured';
        synEl.className   = 'settings-status ' + (hasVercel ? 'active' : 'inactive');
      }
      const pEl = document.getElementById('paddle-status');
      if (pEl) {
        const paddleUrl = Store.getPaddleUrl();
        pEl.textContent = paddleUrl ? paddleUrl : 'Not configured (auto-detects on localhost)';
        pEl.className   = 'settings-status ' + (paddleUrl ? 'active' : 'inactive');
      }
      const badge = document.getElementById('azure-status');
      if (badge) {
        const active = !!(Store.getAzureKey() && Store.getAzureEndpoint());
        badge.textContent = active ? 'Azure OCR Active' : 'Not configured';
        badge.className   = 'azure-status-badge ' + (active ? 'azure-active' : 'azure-inactive');
      }
    }

    document.getElementById('close-apikey-btn').addEventListener('click', () => {
      document.getElementById('apikey-modal').classList.remove('active');
    });
    document.getElementById('save-apikey-btn').addEventListener('click', () => {
      Store.setApiKey(document.getElementById('gemini-key-input').value.trim());
      Store.setGeminiEndpoint(document.getElementById('gemini-endpoint-input').value.trim());
      Store.setOpenAiKey(document.getElementById('openai-key-input').value.trim());
      Store.setGcvKey(document.getElementById('gcv-key-input').value.trim());
      Store.setVercelUrl(document.getElementById('vercel-url-input').value.trim());
      Store.setPaddleUrl(document.getElementById('paddle-url-input').value.trim());
      Store.setAzureEndpoint(document.getElementById('azure-endpoint-input').value.trim());
      Store.setAzureKey(document.getElementById('apikey-input').value.trim());
      OCR.resetPaddleCache();
      _updateOcrStatuses();
      document.getElementById('apikey-modal').classList.remove('active');
      Scanner._toast('OCR settings saved', 'success');
    });

    // ===== OCR ENGINE PILLS =====
    function _initEnginePills() {
      const current = Store.getOcrEngine();
      document.querySelectorAll('.engine-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.engine === current);
        btn.addEventListener('click', () => {
          Store.setOcrEngine(btn.dataset.engine);
          document.querySelectorAll('.engine-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (btn.dataset.engine === 'paddle' && !Store.getPaddleUrl() &&
              !['localhost', '127.0.0.1'].includes(location.hostname)) {
            Scanner._toast('Set PaddleOCR URL in Settings', 'info');
          }
        });
      });
    }
    _initEnginePills();

    // ===== CLOSE OVERLAYS ON BACKDROP CLICK =====
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && overlay.id !== 'setup-modal') {
          overlay.classList.remove('active');
          Admin.populateDropdowns();
        }
      });
    });
  });
})();


