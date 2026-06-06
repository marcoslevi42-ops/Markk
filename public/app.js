/* ── State ── */
let formFile = null, dataFile = null;
let currentFields = [];
let currentFormTitle = '';

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  setupDropZones();
  setupFileInputs();
  setupButtons();
  if (!getApiKey()) showApiModal();
});

/* ── API Key ── */
function getApiKey() { return localStorage.getItem('markk_api_key') || ''; }

function showApiModal() {
  const key = getApiKey();
  if (key) document.getElementById('api-key-input').value = key;
  document.getElementById('api-modal').classList.remove('hidden');
}
function hideApiModal() { document.getElementById('api-modal').classList.add('hidden'); }

document.getElementById('api-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('api-modal')) hideApiModal();
});

function setupButtons() {
  document.getElementById('settings-btn').addEventListener('click', showApiModal);

  document.getElementById('save-key-btn').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (!key) return showToast('Ingresa una API key');
    localStorage.setItem('markk_api_key', key);
    hideApiModal();
    showToast('✅ API key guardada');
  });

  document.getElementById('api-key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('save-key-btn').click();
  });

  document.getElementById('toggle-key').addEventListener('click', () => {
    const inp = document.getElementById('api-key-input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('btn-step1-next').addEventListener('click', () => goToStep(2));
  document.getElementById('btn-analyze').addEventListener('click', analyze);
  document.getElementById('copy-btn').addEventListener('click', copyResults);
  document.getElementById('csv-btn').addEventListener('click', exportCsv);
  document.getElementById('download-img-btn').addEventListener('click', downloadFilledImage);
}

/* ── File Inputs ── */
function setupFileInputs() {
  document.getElementById('input-form').addEventListener('change', e => {
    if (e.target.files[0]) loadFormFile(e.target.files[0]);
  });
  document.getElementById('input-data-gallery').addEventListener('change', e => {
    if (e.target.files[0]) loadDataFile(e.target.files[0]);
  });
  document.getElementById('input-data-camera').addEventListener('change', e => {
    if (e.target.files[0]) loadDataFile(e.target.files[0]);
  });
}

function setupDropZones() {
  setupDrop('drop-form', file => loadFormFile(file));
  const dropData = document.getElementById('drop-data');
  dropData.addEventListener('dragover', e => { e.preventDefault(); dropData.classList.add('dragging'); });
  dropData.addEventListener('dragleave', () => dropData.classList.remove('dragging'));
  dropData.addEventListener('drop', e => {
    e.preventDefault();
    dropData.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadDataFile(file);
    else showToast('Por favor usa una imagen');
  });
}

function setupDrop(id, onFile) {
  const zone = document.getElementById(id);
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) onFile(file);
    else showToast('Por favor usa una imagen');
  });
}

/* ── Load Files ── */
function loadFormFile(file) {
  formFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('img-form').src = e.target.result;
    document.getElementById('name-form').textContent = file.name;
    document.getElementById('drop-form').classList.add('hidden');
    document.getElementById('preview-form').classList.remove('hidden');
    document.getElementById('btn-step1-next').disabled = false;
  };
  reader.readAsDataURL(file);
}

function loadDataFile(file) {
  dataFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('img-data').src = e.target.result;
    document.getElementById('name-data').textContent = file.name;
    document.getElementById('drop-data').classList.add('hidden');
    document.getElementById('preview-data').classList.remove('hidden');
    document.getElementById('btn-analyze').disabled = false;
  };
  reader.readAsDataURL(file);
}

/* ── Navigation ── */
function goToStep(n) {
  document.querySelectorAll('.step-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${n}`).classList.remove('hidden');

  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    if (i + 1 === n) s.classList.add('active');
  });

  // Sync step 2 thumbnail
  if (n === 2 && formFile) {
    document.getElementById('thumb-form').src = document.getElementById('img-form').src;
  }
}

function resetStep1() {
  formFile = null;
  document.getElementById('input-form').value = '';
  document.getElementById('drop-form').classList.remove('hidden');
  document.getElementById('preview-form').classList.add('hidden');
  document.getElementById('btn-step1-next').disabled = true;
}

function resetStep2() {
  dataFile = null;
  document.getElementById('input-data-gallery').value = '';
  document.getElementById('input-data-camera').value = '';
  document.getElementById('drop-data').classList.remove('hidden');
  document.getElementById('preview-data').classList.add('hidden');
  document.getElementById('btn-analyze').disabled = true;
}

function resetAll() {
  resetStep1();
  resetStep2();
  currentFields = [];
  document.getElementById('form-fields').innerHTML = '';
  goToStep(1);
}

/* ── Analysis ── */
async function analyze() {
  if (!formFile || !dataFile) return;

  // Show loading
  document.querySelectorAll('.step-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('loading-section').classList.remove('hidden');

  try {
    const [formB64, dataB64] = await Promise.all([
      fileToBase64(formFile),
      fileToBase64(dataFile)
    ]);

    const payload = {
      apiKey: getApiKey(),
      formImage: formB64,
      formMime: formFile.type || 'image/jpeg',
      dataImage: dataB64,
      dataMime: dataFile.type || 'image/jpeg'
    };

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || `Error ${res.status}`);
    }

    renderResults(result);

    // Show step 3
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('step3').classList.remove('hidden');
    document.querySelectorAll('.step').forEach((s, i) => {
      s.classList.remove('active', 'done');
      if (i < 2) s.classList.add('done');
      if (i === 2) s.classList.add('active');
    });

  } catch (err) {
    document.getElementById('loading-section').classList.add('hidden');
    goToStep(2);

    if (err.message.includes('API key') || err.message.includes('401') || err.message.includes('auth')) {
      showToast('❌ API key inválida', 4000);
      showApiModal();
    } else {
      showToast('❌ ' + (err.message || 'Error al analizar'), 5000);
    }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Render Results ── */
function renderResults(result) {
  currentFields = result.fields || [];
  currentFormTitle = result.form_title || 'Formulario';

  document.getElementById('form-title-badge').textContent = currentFormTitle;
  document.getElementById('result-form-img').src = document.getElementById('img-form').src;
  document.getElementById('result-data-img').src = document.getElementById('img-data').src;

  const overlay = document.getElementById('overlay-container');
  overlay.querySelectorAll('.overlay-field-wrap').forEach(el => el.remove());

  const fallback = document.getElementById('overlay-fallback');
  const fieldsWithBox = currentFields.filter(f => f.box);

  if (currentFields.length && fieldsWithBox.length) {
    fallback.classList.add('hidden');
    currentFields.forEach((field, i) => {
      if (!field.box) return;
      const isEmpty = !field.value;
      const isLow = field.confidence === 'low';

      const wrap = document.createElement('div');
      wrap.className = 'overlay-field-wrap';
      wrap.style.left = `${field.box.x}%`;
      wrap.style.top = `${field.box.y}%`;
      wrap.style.width = `${field.box.width}%`;
      wrap.style.height = `${field.box.height}%`;
      wrap.innerHTML = `
        <div class="erase-patch"></div>
        <input type="text" class="overlay-field${isEmpty ? ' field-empty' : ''}${isLow ? ' confidence-low' : ''}" />
        <div class="drag-handle" title="Arrastrar para reposicionar">✥</div>
      `;

      const input = wrap.querySelector('.overlay-field');
      input.value = field.value || '';
      input.title = field.label || '';
      input.placeholder = field.label || '';
      input.addEventListener('input', e => {
        currentFields[i].value = e.target.value;
        input.classList.toggle('field-empty', !e.target.value.trim());
      });

      overlay.appendChild(wrap);
      makeDraggable(wrap, field, overlay);
    });
  } else {
    fallback.classList.remove('hidden');
    renderFieldList();
  }
}

/* ── Drag to reposition misplaced fields ── */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function makeDraggable(wrap, field, container) {
  const handle = wrap.querySelector('.drag-handle');
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);

    const rect = container.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const startLeft = field.box.x, startTop = field.box.y;

    const onMove = ev => {
      const dxPct = (ev.clientX - startX) / rect.width * 100;
      const dyPct = (ev.clientY - startY) / rect.height * 100;
      field.box.x = clamp(startLeft + dxPct, 0, 100 - field.box.width);
      field.box.y = clamp(startTop + dyPct, 0, 100 - field.box.height);
      wrap.style.left = `${field.box.x}%`;
      wrap.style.top = `${field.box.y}%`;
    };
    const onUp = ev => {
      handle.releasePointerCapture(ev.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

function renderFieldList() {
  const container = document.getElementById('form-fields');
  container.innerHTML = '';

  if (!currentFields.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">No se encontraron campos en el formulario.</p>';
    return;
  }

  currentFields.forEach((field, i) => {
    const isEmpty = !field.value;
    const isLow = field.confidence === 'low';

    const item = document.createElement('div');
    item.className = `field-item${isEmpty ? ' field-empty' : ''}`;
    item.innerHTML = `
      <div class="field-label">
        <span class="confidence-dot ${isLow ? 'confidence-low' : 'confidence-high'}"></span>
        ${escHtml(field.label)}
      </div>
      <textarea class="field-value" rows="1" placeholder="Sin dato">${escHtml(field.value || '')}</textarea>
    `;

    const ta = item.querySelector('textarea');
    autoResize(ta);
    ta.addEventListener('input', e => {
      autoResize(e.target);
      currentFields[i].value = e.target.value;
      item.classList.toggle('field-empty', !e.target.value.trim());
    });

    container.appendChild(item);
  });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Export ── */
function copyResults() {
  if (!currentFields.length) return;
  const text = `${currentFormTitle}\n${'─'.repeat(30)}\n` +
    currentFields.map(f => `${f.label}: ${f.value || '(vacío)'}`).join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showToast('📋 Copiado'))
    .catch(() => showToast('No se pudo copiar'));
}

function exportCsv() {
  if (!currentFields.length) return;
  const csv = 'Campo,Valor\n' +
    currentFields.map(f => `"${csvEsc(f.label)}","${csvEsc(f.value || '')}"`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `markk-${currentFormTitle.toLowerCase().replace(/\s+/g,'-')}.csv`;
  a.click();
  showToast('💾 CSV descargado');
}

function csvEsc(s) { return String(s).replace(/"/g,'""'); }

function downloadFilledImage() {
  const img = document.getElementById('result-form-img');
  if (!img.naturalWidth) return showToast('La imagen todavía no cargó, esperá un momento');

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  currentFields.forEach(field => {
    if (!field.box || !field.value) return;
    const px = field.box.x / 100 * canvas.width;
    const py = field.box.y / 100 * canvas.height;
    const pw = field.box.width / 100 * canvas.width;
    const ph = field.box.height / 100 * canvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px, py, pw, ph);

    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'middle';
    let fontSize = Math.max(10, Math.floor(ph * 0.6));
    ctx.font = `${fontSize}px sans-serif`;
    while (fontSize > 8 && ctx.measureText(field.value).width > pw - 8) {
      fontSize -= 1;
      ctx.font = `${fontSize}px sans-serif`;
    }
    ctx.fillText(field.value, px + 4, py + ph / 2, pw - 8);
  });

  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `markk-${currentFormTitle.toLowerCase().replace(/\s+/g,'-')}.png`;
    a.click();
    showToast('🖼️ Imagen descargada');
  }, 'image/png');
}

/* ── Toast ── */
let toastTimer;
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), duration);
}
