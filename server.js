const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

async function callClaude(apiKey, formImageB64, formMime, dataImageB64, dataMime) {
  const prompt = `Se te dan DOS imágenes:
1. FORMULARIO: una imagen del formulario vacío o plantilla con sus campos
2. DATOS: una imagen/foto con los datos que deben completar ese formulario

Tu tarea:
- Identifica todos los campos rellenables del FORMULARIO (nombres, fechas, montos, casillas, líneas en blanco, recuadros, etc.)
- Para cada campo, ubica con precisión el ÁREA EN BLANCO donde se debe escribir el valor dentro de la imagen del FORMULARIO (no el área del texto de la etiqueta/label, sino el espacio vacío a completar: la línea, casilla o recuadro)
- Expresa esa ubicación como un cuadro delimitador en PORCENTAJES relativos al ancho y alto totales de la imagen del FORMULARIO (0 a 100), donde x/y es la esquina superior izquierda del área en blanco
- Extrae los valores correspondientes de la imagen de DATOS
- Devuelve ÚNICAMENTE un JSON válido con este formato exacto:

{
  "form_title": "Nombre del formulario identificado",
  "fields": [
    {
      "label": "Nombre del campo",
      "value": "Valor extraído de los datos",
      "confidence": "high",
      "box": {"x": 12.5, "y": 30.2, "width": 35.0, "height": 6.5}
    }
  ]
}

Usa "confidence": "high" si el valor es claro, "low" si es difícil de leer.
Si un campo no tiene dato correspondiente en la imagen de datos, pon "value": "".
Si no podés determinar la ubicación de un campo, omití la clave "box" para ese campo.
Sé exhaustivo — extrae TODOS los campos del formulario, y sé lo más preciso posible con las coordenadas del área en blanco a completar.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Imagen 1 — FORMULARIO (plantilla a completar):'
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: formMime, data: formImageB64 }
        },
        {
          type: 'text',
          text: 'Imagen 2 — DATOS (foto con la información a ingresar):'
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: dataMime, data: dataImageB64 }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  return new Promise((resolve, reject) => {
    const req = require('https').request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject({ status: res.statusCode, message: parsed.error.message });
          const text = parsed.content[0].text.trim();
          const match = text.match(/\{[\s\S]*\}/);
          if (!match) return reject({ status: 500, message: 'Respuesta inesperada de la IA' });
          resolve(JSON.parse(match[0]));
        } catch(e) {
          reject({ status: 500, message: 'Error procesando respuesta: ' + e.message });
        }
      });
    });
    req.on('error', e => reject({ status: 503, message: e.message }));
    req.write(body);
    req.end();
  });
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // API endpoint
  if (req.method === 'POST' && req.url === '/api/analyze') {
    try {
      const raw = await collectBody(req);
      const body = JSON.parse(raw.toString());

      const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'API key requerida. Configúrala en ⚙️ o en la variable ANTHROPIC_API_KEY del servidor.' }));
      }

      const result = await callClaude(
        apiKey,
        body.formImage, body.formMime || 'image/jpeg',
        body.dataImage, body.dataMime || 'image/jpeg'
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err.status || 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Error interno' }));
    }
    return;
  }

  // Static files
  const urlPath = req.url.split('?')[0];
  const filePath = path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Markk corriendo en http://localhost:${PORT}\n`);
});
