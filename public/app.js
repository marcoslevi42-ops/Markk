/* ── State ── */
let currentFile = null;
let currentFields = [];

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  if (!getApiKey()) showApiModal();
  setupEventListeners();
});

function setupEventListeners() {
  // API key modal
  document.getElementById('settings-btn').addEventListener('click', showApiModal);
  document.getElementById('save-key-btn').addEventListener('click', saveApiKey);
  document.getElementById('toggle-key').addEventListener('click', toggleKeyVisibility);
  document.getElementById('api-key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveApiKey();
  });

  // File inputs
  document.getElementById('file-input').addEventListener('change', handleFileSelect);
  document.getElementById('camera-input').addEventListener('change', handleFileSelect);

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
    else showToast('Por favor sube una imagen válida');
  });

  // Preview actions
  document.getElementById('analyze-btn').addEventListener('click', analyzeDocument);
  document.getElementById('change-img-btn').addEventListener('click', resetToUpload);

  // Results actions
  document.getElementById('copy-btn').addEventListener('click', copyResults);
  document.getElementById('csv-btn').addEventListener('click', exportCsv);
  document.getElementById('new-scan-btn').addEventListener('click', resetToUpload);
}

/* ── API Key ── */
function getApiKey() { return localStorage.getItem('markk_api_key'); }

function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showToast('Ingresa una API key válida'); return; }
  if (!key.startsWith('sk-ant-')) {
    showToast('La key debe comenzar con sk-ant-');
    return;
  }
  localStorage.setItem('markk_api_key', key);
  hideApiModal();
  showToast('✅ API key guardada');
}

function toggleKeyVisibility() {
  const input = document.getElementById('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function showApiModal() {
  const key = getApiKey();
  if (key) document.getElementById('api-key-input').value = key;
  document.getElementById('api-modal').classList.remove('hidden');
}

function hideApiModal() {
  document.getElementById('api-modal').classList.add('hidden');
}

document.getElementById('api-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('api-modal')) hideApiModal();
});

/* ── Camera ── */
function openCamera() {
  document.getElementById('camera-input').click();
}

/* ── File Handling ── */
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) loadFile(file);
}

function loadFile(file) {
  currentFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('preview-img').src = e.target.result;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatSize(file.size);
    showSection('preview-section');
  };
  reader.readAsDataURL(file);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ── Analysis ── */
async function analyzeDocument() {
  const apiKey = getApiKey();
  if (!apiKey) { showApiModal(); return; }
  if (!currentFile) return;

  showSection('loading-section');

  try {
    const base64 = await fileToBase64(currentFile);
    const mediaType = currentFile.type || 'image/jpeg';
    const result = await callClaudeVision(apiKey, base64, mediaType);
    renderResults(result);
    showSection('results-section');
  } catch (err) {
    showSection('preview-section');
    if (err.status === 401) {
      showToast('❌ API key inválida — verifica tu clave');
      showApiModal();
    } else {
      showToast('❌ Error: ' + (err.message || 'Inténtalo de nuevo'));
    }
  }
}

async function callClaudeVision(apiKey, base64Data, mediaType) {
  const prompt = `Analiza esta imagen de un documento y extrae TODOS los datos visibles.

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con este formato exacto:
{
  "document_type": "Tipo de documento en español (ej: DNI, Factura, Contrato, Recibo, etc.)",
  "fields": [
    {"label": "Nombre del campo", "value": "Valor extraído", "confidence": "high"}
  ]
}

Instrucciones:
- Extrae absolutamente todos los campos y datos que puedas ver
- Usa "confidence": "high" si el texto es claro, "low" si es difícil de leer
- Si un valor no es legible, pon "value": "No legible"
- Los labels deben estar en español y ser descriptivos
- Sé exhaustivo: fechas, números, nombres, direcciones, importes, códigos, etc.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const text = data.content[0].text.trim();

  // Extract JSON from response (handles markdown code blocks if present)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Respuesta inesperada de la IA');

  return JSON.parse(jsonMatch[0]);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      // Remove data URL prefix (data:image/...;base64,)
      const base64 = e.target.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Render Results ── */
function renderResults(result) {
  currentFields = result.fields || [];

  document.getElementById('doc-badge').textContent = result.document_type || 'Documento';
  document.getElementById('doc-title').textContent =
    result.document_type ? `Datos del ${result.document_type}` : 'Datos extraídos';

  const container = document.getElementById('form-fields');
  container.innerHTML = '';

  if (!currentFields.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">No se encontraron datos en el documento.</p>';
    return;
  }

  currentFields.forEach((field, i) => {
    const isEmpty = !field.value || field.value === 'No legible';
    const isLow = field.confidence === 'low';

    const item = document.createElement('div');
    item.className = `field-item${isEmpty ? ' field-empty' : ''}`;
    item.innerHTML = `
      <div class="field-label">
        <span class="confidence-dot ${isLow ? 'confidence-low' : 'confidence-high'}"></span>
        ${escapeHtml(field.label)}
      </div>
      <textarea
        class="field-value"
        rows="1"
        data-index="${i}"
        placeholder="Sin valor"
      >${escapeHtml(field.value || '')}</textarea>
    `;

    const textarea = item.querySelector('textarea');
    autoResize(textarea);
    textarea.addEventListener('input', e => {
      autoResize(e.target);
      currentFields[i].value = e.target.value;
      item.classList.toggle('field-empty', !e.target.value);
    });

    container.appendChild(item);
  });
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Export ── */
function copyResults() {
  if (!currentFields.length) return;
  const text = currentFields
    .map(f => `${f.label}: ${f.value || ''}`)
    .join('\n');
  navigator.clipboard.writeText(text)
    .then(() => showToast('📋 Copiado al portapapeles'))
    .catch(() => {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('📋 Copiado al portapapeles');
    });
}

function exportCsv() {
  if (!currentFields.length) return;
  const docType = document.getElementById('doc-badge').textContent;
  const headers = 'Campo,Valor\n';
  const rows = currentFields
    .map(f => `"${csvEscape(f.label)}","${csvEscape(f.value || '')}"`)
    .join('\n');
  const csv = headers + rows;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `markk-${docType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('💾 CSV descargado');
}

function csvEscape(str) {
  return String(str).replace(/"/g, '""');
}

/* ── Section Navigation ── */
function showSection(id) {
  ['upload-section', 'preview-section', 'loading-section', 'results-section'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

function resetToUpload() {
  currentFile = null;
  currentFields = [];
  document.getElementById('file-input').value = '';
  document.getElementById('camera-input').value = '';
  document.getElementById('preview-img').src = '';
  document.getElementById('form-fields').innerHTML = '';
  showSection('upload-section');
}

/* ── Toast ── */
let toastTimer = null;
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}
