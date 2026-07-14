/**
 * Conector a siHosp — autocompletado de formularios web mediante Playwright.
 *
 * Toma los campos extraídos por Markk ({ label, value }) y los carga en el
 * formulario web de siHosp: hace login, navega al formulario y rellena cada
 * campo emparejándolo por selector configurado o, si no hay override, de forma
 * automática por label / name / id / placeholder / aria-label.
 *
 * La configuración vive en sihosp.config.json. Las credenciales se leen de
 * variables de entorno (nunca del archivo de config ni del request).
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'sihosp.config.json');

function loadConfig(overrides = {}) {
  let base = {};
  try {
    base = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    throw new Error('No se pudo leer sihosp.config.json: ' + e.message);
  }
  // Merge superficial + merge de sub-objetos conocidos.
  const cfg = { ...base, ...overrides };
  cfg.login = { ...(base.login || {}), ...(overrides.login || {}) };
  cfg.form = { ...(base.form || {}), ...(overrides.form || {}) };
  cfg.fieldMap = { ...(base.fieldMap || {}), ...(overrides.fieldMap || {}) };
  return cfg;
}

/** Carga playwright de forma perezosa para no romper el arranque si falta. */
function requirePlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    throw new Error(
      'Playwright no está instalado. Ejecutá "npm install playwright" ' +
      'para habilitar el conector a siHosp.'
    );
  }
}

/** Normaliza texto para comparar labels: minúsculas, sin acentos ni símbolos. */
function norm(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Lanza Chromium usando el binario preinstalado si está disponible. */
async function launchBrowser(playwright, cfg) {
  const opts = {
    headless: cfg.headless !== false,
    // --no-sandbox es necesario para correr Chromium dentro de contenedores
    // (Railway, Docker) donde suele ejecutarse como root.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
  // En entornos con Chromium preinstalado (PLAYWRIGHT_BROWSERS_PATH) Playwright
  // lo encuentra solo; si se define SIHOSP_CHROMIUM se usa ese ejecutable.
  if (process.env.SIHOSP_CHROMIUM) opts.executablePath = process.env.SIHOSP_CHROMIUM;
  try {
    return await playwright.chromium.launch(opts);
  } catch (e) {
    throw new Error('No se pudo iniciar el navegador: ' + e.message);
  }
}

/** Devuelve el primer locator visible de una lista de selectores candidatos. */
async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    if (!sel) continue;
    const loc = page.locator(sel).first();
    try {
      if (await loc.count() && await loc.isVisible()) return loc;
    } catch (_) { /* selector inválido: seguir */ }
  }
  return null;
}

async function doLogin(page, cfg, log, creds = {}) {
  const l = cfg.login || {};
  if (!l.enabled) { log.push('Login deshabilitado, se omite.'); return; }

  // Prioridad: credenciales pasadas en el pedido > variables de entorno.
  const user = creds.user || process.env[l.userEnv || 'SIHOSP_USER'];
  const pass = creds.pass || process.env[l.passEnv || 'SIHOSP_PASS'];
  if (!user || !pass) {
    throw new Error(
      'Faltan las credenciales de siHosp. Cargá tu usuario y contraseña ' +
      'en la app (botón siHosp) o definí las variables de entorno ' +
      `${l.userEnv || 'SIHOSP_USER'} y ${l.passEnv || 'SIHOSP_PASS'}.`
    );
  }

  const loginUrl = new URL(l.url || '/login', cfg.baseUrl).toString();
  log.push('Navegando al login: ' + loginUrl);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Campo de usuario: selector configurado o heurística (primer input de texto visible).
  const userLoc = await firstVisible(page, [
    l.userSelector,
    "input[name*='usuario' i]", "input[name*='user' i]", "input[id*='usuario' i]", "input[id*='user' i]",
    "input[type='email']", "input[type='text']", "input:not([type])"
  ]);
  if (!userLoc) throw new Error('No se encontró el campo de usuario en el login de siHosp.');
  await userLoc.fill(user);

  // Campo de contraseña: siempre es el input de tipo password.
  const passLoc = await firstVisible(page, [l.passSelector, "input[type='password']"]);
  if (!passLoc) throw new Error('No se encontró el campo de contraseña en el login de siHosp.');
  await passLoc.fill(pass);

  // Enviar. Prioridad: botón por texto ("Ingresar"/"Entrar"...) para no confundir
  // con el toggle de "mostrar contraseña". Luego submit genérico, y por último Enter.
  const submitByText = page.locator(
    "button:has-text('Ingresar'), button:has-text('Entrar'), button:has-text('Iniciar'), " +
    "button:has-text('Acceder'), button:has-text('Login'), button:has-text('Ingres')"
  ).first();
  let submitLoc = null;
  if (await submitByText.count() && await submitByText.isVisible().catch(() => false)) {
    submitLoc = submitByText;
  } else {
    submitLoc = await firstVisible(page, [
      l.submitSelector, "button[type='submit']", "input[type='submit']"
    ]);
  }

  const beforeUrl = page.url();
  if (submitLoc) await submitLoc.click().catch(() => {});
  else await passLoc.press('Enter');

  // siHosp es una SPA (Angular): esperar a que la URL deje de ser la de login,
  // en vez de confiar en un evento de carga tradicional.
  await Promise.race([
    page.waitForFunction(
      u => location.href !== u && !/\/login/i.test(location.href),
      beforeUrl,
      { timeout: cfg.timeoutMs || 30000 }
    ).catch(() => {}),
    page.waitForLoadState('networkidle').catch(() => {})
  ]);
  await page.waitForTimeout(1200);

  // Si seguimos en el login, el ingreso falló (credenciales o selector).
  if (/\/login/i.test(page.url())) {
    log.push('⚠️ Sigue en la página de login tras enviar: revisar credenciales o el botón de ingreso.');
  }

  if (l.successSelector) {
    await page.waitForSelector(l.successSelector, { timeout: cfg.timeoutMs || 30000 });
  }
  log.push('Login enviado. Página actual: ' + page.url());
}

/**
 * Intenta localizar el control asociado a un campo lógico.
 * Prioridad: override en fieldMap -> <label> con texto -> atributos.
 * Devuelve un Locator de Playwright o null.
 */
async function findControl(page, label, cfg) {
  // 1. Override explícito por selector.
  const override = cfg.fieldMap && cfg.fieldMap[label];
  if (override) {
    const loc = page.locator(override).first();
    if (await loc.count()) return loc;
  }

  const target = norm(label);
  if (!target) return null;

  // 2. Buscar un <label> cuyo texto coincida y resolver su control.
  const labels = page.locator('label');
  const n = await labels.count();
  for (let i = 0; i < n; i++) {
    const el = labels.nth(i);
    const txt = norm(await el.textContent());
    if (!txt) continue;
    if (txt === target || txt.includes(target) || target.includes(txt)) {
      const forAttr = await el.getAttribute('for');
      if (forAttr) {
        const byId = page.locator(`[id="${forAttr.replace(/"/g, '\\"')}"]`).first();
        if (await byId.count()) return byId;
      }
      // Control anidado dentro del label.
      const nested = el.locator('input, textarea, select').first();
      if (await nested.count()) return nested;
    }
  }

  // 3. Emparejar por atributos name / id / placeholder / aria-label.
  const controls = page.locator('input:not([type=hidden]), textarea, select');
  const m = await controls.count();
  for (let i = 0; i < m; i++) {
    const el = controls.nth(i);
    const attrs = norm(
      [
        await el.getAttribute('name'),
        await el.getAttribute('id'),
        await el.getAttribute('placeholder'),
        await el.getAttribute('aria-label')
      ].filter(Boolean).join(' ')
    );
    if (attrs && (attrs.includes(target) || target.includes(attrs))) return el;
  }

  return null;
}

async function fillControl(loc, value) {
  const tag = (await loc.evaluate(el => el.tagName)).toLowerCase();
  if (tag === 'select') {
    try {
      await loc.selectOption({ label: String(value) });
      return true;
    } catch (_) {
      try { await loc.selectOption(String(value)); return true; } catch (_) { return false; }
    }
  }
  await loc.fill(String(value));
  return true;
}

/**
 * Carga los campos en el formulario de siHosp.
 *
 * @param {Array<{label:string,value:string}>} fields
 * @param {object} overrides  Config puntual (mismo shape que sihosp.config.json).
 * @returns {Promise<{ok:boolean, filled:Array, missing:Array, submitted:boolean, screenshot:?string, log:Array}>}
 */
async function fillForm(fields, overrides = {}) {
  // Las credenciales no forman parte de la config: se extraen aparte.
  const creds = { user: overrides.user, pass: overrides.pass };
  const cfg = loadConfig(overrides);
  const playwright = requirePlaywright();
  const log = [];
  const filled = [];
  const missing = [];

  if (!Array.isArray(fields) || !fields.length) {
    throw new Error('No hay campos para cargar.');
  }

  const browser = await launchBrowser(playwright, cfg);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(cfg.timeoutMs || 30000);

    await doLogin(page, cfg, log, creds);

    // Si hay una URL de formulario configurada, navegamos; si no, completamos
    // la página a la que llegó el login (modo "hacelo andar" sin config extra).
    const formPath = cfg.form && cfg.form.url;
    if (formPath && formPath !== '/' && formPath.trim() !== '') {
      const formUrl = new URL(formPath, cfg.baseUrl).toString();
      log.push('Navegando al formulario: ' + formUrl);
      await page.goto(formUrl, { waitUntil: 'domcontentloaded' });
    } else {
      log.push('Sin form.url configurada: se completa la página actual tras el login.');
    }
    if (cfg.form && cfg.form.readySelector) {
      await page.waitForSelector(cfg.form.readySelector, { timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(400);

    for (const field of fields) {
      const label = field.label || field.campo || '';
      const value = field.value != null ? field.value : field.valor;
      if (!label || value === '' || value == null) {
        missing.push({ label, reason: 'sin valor' });
        continue;
      }
      const loc = await findControl(page, label, cfg);
      if (!loc) { missing.push({ label, reason: 'campo no encontrado' }); continue; }
      const ok = await fillControl(loc, value);
      if (ok) { filled.push({ label, value: String(value) }); log.push(`✔ ${label}`); }
      else { missing.push({ label, reason: 'no se pudo completar' }); }
    }

    let submitted = false;
    if (cfg.submit && cfg.form && cfg.form.submitSelector) {
      await page.click(cfg.form.submitSelector);
      await page.waitForLoadState('networkidle').catch(() => {});
      submitted = true;
      log.push('Formulario enviado.');
    } else {
      log.push('Modo revisión: formulario completado pero NO enviado (submit=false).');
    }

    // Inventario de la página: qué campos y links ve el navegador. Permite
    // diagnosticar a distancia cuándo el conector cae en la página equivocada.
    let pagina = null;
    try {
      pagina = await page.evaluate(() => {
        const controls = Array.from(
          document.querySelectorAll('input:not([type=hidden]), textarea, select')
        ).slice(0, 40).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || null,
          name: el.getAttribute('name') || null,
          id: el.id || null,
          placeholder: el.getAttribute('placeholder') || null,
          label: (el.labels && el.labels[0] && el.labels[0].textContent.trim().slice(0, 60)) || null
        }));
        const links = Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({ text: (a.textContent || '').trim().slice(0, 60), href: a.getAttribute('href') }))
          .filter(l => l.text)
          .slice(0, 40);
        return { title: document.title, controls, links };
      });
      pagina.url = page.url();
    } catch (_) { /* diagnóstico best-effort */ }

    let screenshot = null;
    if (cfg.screenshot !== false) {
      const buf = await page.screenshot({ fullPage: false });
      screenshot = buf.toString('base64');
    }

    return { ok: true, filled, missing, submitted, screenshot, log, pagina };
  } finally {
    await browser.close();
  }
}

module.exports = { fillForm, loadConfig, norm, CONFIG_PATH };
