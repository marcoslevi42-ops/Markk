# Markk

Llenado automático de formularios clínicos desde fotos con IA, con servidor MCP
y **conector a siHosp** para autocompletar formularios web.

## Desplegar en un clic (gratis)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/marcoslevi42-ops/Markk)

1. Tocá el botón y entrá a Render con tu cuenta de **GitHub** (gratis, sin tarjeta).
2. Cuando pida `SIHOSP_USER` y `SIHOSP_PASS`, poné tu usuario y contraseña de siHosp.
3. Al terminar el deploy, copiá la URL de la app (algo como `https://markk.onrender.com`).
4. En **claude.ai → Configuración → Conectores → Agregar conector personalizado**,
   pegá esa URL agregándole `/mcp` al final: `https://markk.onrender.com/mcp`.

> El plan gratuito de Render "duerme" la app tras 15 min sin uso; el primer pedido
> después de eso tarda ~1 minuto en despertar.

## Puesta en marcha local

```bash
npm install
npm start           # arranca en http://localhost:3000
```

## Conector a siHosp

El conector abre el sitio de siHosp con un navegador headless (Playwright), hace
login y **autocompleta el formulario** con los campos que genera Markk. Empareja
cada campo por selector configurado o, si no hay override, automáticamente por el
texto del `<label>`, `name`, `id`, `placeholder` o `aria-label`.

### Configuración

Editá `sihosp.config.json` con la URL y los selectores reales de siHosp:

| Clave                 | Descripción                                                        |
|-----------------------|--------------------------------------------------------------------|
| `baseUrl`             | URL base del sitio de siHosp.                                       |
| `headless`            | `true` para correr sin ventana visible.                            |
| `submit`              | `true` para enviar el formulario; `false` = solo completar (revisión). |
| `screenshot`          | `true` para devolver una captura en base64 del resultado.          |
| `login.*`             | Ruta y selectores de usuario/clave/botón del login.                |
| `form.url`            | Ruta del formulario destino.                                       |
| `form.readySelector`  | Selector que confirma que el formulario cargó.                     |
| `fieldMap`            | Overrides opcionales `label → selector CSS`.                       |

Las **credenciales nunca se guardan en el archivo**: se leen de variables de
entorno.

```bash
cp .env.example .env      # y completá los valores
export SIHOSP_USER="tu_usuario"
export SIHOSP_PASS="tu_clave"
```

### Navegador

Playwright necesita un Chromium. En un entorno con Chromium preinstalado podés
apuntar al ejecutable con `SIHOSP_CHROMIUM`; si no, instalá el navegador:

```bash
npx playwright install chromium
```

### Uso

**Desde la web:** en el paso 3 (Resultado), botón **🏥 Cargar en siHosp**.

**Vía HTTP:**

```bash
curl -X POST http://localhost:3000/api/sihosp \
  -H 'Content-Type: application/json' \
  -d '{"campos":[{"label":"Paciente","value":"Juan Pérez"},{"label":"DNI","value":"30111222"}]}'
```

**Vía MCP:** herramienta `cargar_en_sihosp` en el endpoint `/mcp`, con argumentos
`{ campos: [{label, value}], formUrl?, submit? }`.

## MCP

El servidor expone en `/mcp` las herramientas: `estado_markk`,
`completar_formulario_trauma`, `pedido_protesis_cadera`, `pedido_ambulancia`,
`epicrisis_trauma`, `internacion_domiciliaria` y `cargar_en_sihosp`.
