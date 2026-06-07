const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function mcpResponse(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function mcpError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

const MCP_TOOLS = [
  {
    name: 'estado_markk',
    description: 'Verifica si el servidor Markk está online.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'completar_formulario_trauma',
    description: 'Organiza datos traumatológicos o clínicos en formato listo para copiar en formularios médicos.',
    inputSchema: {
      type: 'object',
      properties: {
        paciente: { type: 'string' },
        edad: { type: 'string' },
        dni: { type: 'string' },
        diagnostico: { type: 'string' },
        procedimiento: { type: 'string' },
        sala_cama: { type: 'string' },
        observaciones: { type: 'string' }
      },
      required: ['paciente', 'diagnostico']
    }
  },
  {
    name: 'preparar_formulario_medico',
    description: 'Prepara campos para formularios médicos: PAMI, ambulancia, alta, internación domiciliaria o pedido de prótesis.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo_formulario: { type: 'string' },
        paciente: { type: 'string' },
        edad: { type: 'string' },
        dni: { type: 'string' },
        obra_social: { type: 'string' },
        diagnostico: { type: 'string' },
        procedimiento: { type: 'string' },
        sala_cama: { type: 'string' },
        fecha: { type: 'string' },
        medico: { type: 'string' },
        observaciones: { type: 'string' }
      },
      required: ['tipo_formulario', 'paciente', 'diagnostico']
    }
  }
];

async function handleMcp(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }

  if (req.method === 'GET') {
    return sendJson(res, 200, {
      name: 'Trauma Forma AI',
      status: 'online',
      endpoint: '/mcp'
    });
  }

  const raw = await collectBody(req);
  const body = JSON.parse(raw.toString() || '{}');

  const { id, method, params } = body;

  if (method === 'initialize') {
    return sendJson(res, 200, mcpResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'Trauma Forma AI',
        version: '1.0.0'
      }
    }));
  }

  if (method === 'notifications/initialized') {
    res.writeHead(202);
    return res.end();
  }

  if (method === 'tools/list') {
    return sendJson(res, 200, mcpResponse(id, {
      tools: MCP_TOOLS
    }));
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'estado_markk') {
      return sendJson(res, 200, mcpResponse(id, {
        content: [
          {
            type: 'text',
            text: 'Markk está online. Endpoint MCP activo: /mcp'
          }
        ]
      }));
    }

    if (toolName === 'completar_formulario_trauma') {
      const texto = [
        `Paciente: ${args.paciente || ''}`,
        args.edad ? `Edad: ${args.edad}` : null,
        args.dni ? `DNI: ${args.dni}` : null,
        args.sala_cama ? `Sala/Cama: ${args.sala_cama}` : null,
        `Diagnóstico: ${args.diagnostico || ''}`,
        args.procedimiento ? `Procedimiento/Plan: ${args.procedimiento}` : null,
        args.observaciones ? `Observaciones: ${args.observaciones}` : null
      ].filter(Boolean).join('\n');

      return sendJson(res, 200, mcpResponse(id, {
        content: [{ type: 'text', text: texto }]
      }));
    }

    if (toolName === 'preparar_formulario_medico') {
      const texto = [
        `Tipo de formulario: ${args.tipo_formulario || ''}`,
        `Paciente: ${args.paciente || ''}`,
        args.edad ? `Edad: ${args.edad}` : null,
        args.dni ? `DNI: ${args.dni}` : null,
        args.obra_social ? `Obra social: ${args.obra_social}` : null,
        args.sala_cama ? `Sala/Cama: ${args.sala_cama}` : null,
        `Diagnóstico: ${args.diagnostico || ''}`,
        args.procedimiento ? `Procedimiento/Plan: ${args.procedimiento}` : null,
        args.fecha ? `Fecha: ${args.fecha}` : null,
        args.medico ? `Médico: ${args.medico}` : null,
        args.observaciones ? `Observaciones: ${args.observaciones}` : null
      ].filter(Boolean).join('\n');

      return sendJson(res, 200, mcpResponse(id, {
        content: [{ type: 'text', text: texto }]
      }));
    }

    return sendJson(res, 200, mcpError(id, -32601, 'Herramienta no encontrada'));
  }

  return sendJson(res, 200, mcpError(id, -32601, 'Método MCP no soportado'));
}

async function callClaude(apiKey, formImageB64, formMime, dataImageB64, dataMime) {
  const prompt = `Se te dan DOS imágenes:
1. FORMULARIO: una imagen del formulario vacío o plantilla con sus campos
2. DATOS: una imagen/foto con los datos que deben completar ese formulario

Tu tarea:
- Identifica todos los campos del FORMULARIO.
- Extrae los valores correspondientes de la imagen de DATOS.
- Devuelve únicamente JSON válido.`;

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Imagen 1 — FORMULARIO:' },
        { type: 'image', source: { type: 'base64', media_type: formMime, data: formImageB64 } },
        { type: 'text', text: 'Imagen 2 — DATOS:' },
        { type: 'image', source: { type: 'base64', media_type: dataMime, data: dataImageB64 } },
        { type: 'text', text: prompt }
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
    const request = require('https').request(options, response => {
      let data = '';

      response.on('data', chunk => data += chunk);

      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (parsed.error) {
            return reject({
              status: response.statusCode,
              message: parsed.error.message
            });
          }

          const text = parsed.content[0].text.trim();
          const match = text.match(/\{[\s\S]*\}/);

          if (!match) {
            return reject({
              status: 500,
              message: 'Respuesta inesperada de la IA'
            });
          }

          resolve(JSON.parse(match[0]));
        } catch (error) {
          reject({
            status: 500,
            message: 'Error procesando respuesta: ' + error.message
          });
        }
      });
    });

    request.on('error', error => {
      reject({
        status: 503,
        message: error.message
      });
    });

    request.write(body);
    request.end();
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/mcp') {
    try {
      return await handleMcp(req, res);
    } catch (error) {
      return sendJson(res, 500, {
        error: error.message || 'Error MCP'
      });
    }
  }

  if (req.method === 'POST' && urlPath === '/api/analyze') {
    try {
      const raw = await collectBody(req);
      const body = JSON.parse(raw.toString());

      const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        res.writeHead(400, {
          'Content-Type': 'application/json'
        });

        return res.end(JSON.stringify({
          error: 'API key requerida.'
        }));
      }

      const result = await callClaude(
        apiKey,
        body.formImage,
        body.formMime || 'image/jpeg',
        body.dataImage,
        body.dataMime || 'image/jpeg'
      );

      res.writeHead(200, {
        'Content-Type': 'application/json'
      });

      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(error.status || 500, {
        'Content-Type': 'application/json'
      });

      res.end(JSON.stringify({
        error: error.message || 'Error interno'
      }));
    }

    return;
  }

  const filePath = path.join(
    PUBLIC,
    urlPath === '/' ? 'index.html' : urlPath
  );

  const ext = path.extname(filePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end('Not found');
    }

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream'
    });

    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Markk corriendo en puerto ${PORT}`);
  console.log(`🔌 MCP activo en /mcp`);
});
