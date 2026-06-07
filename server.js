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
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
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

function textContent(text) {
  return [{ type: 'text', text }];
}

const MCP_TOOLS = [
  {
    name: 'estado_markk',
    description: 'Verifica si el servidor Markk está online.',
    inputSchema: { type: 'object', properties: {} }
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
    name: 'pedido_protesis_cadera',
    description: 'Genera un pedido de prótesis de cadera traumatológico.',
    inputSchema: {
      type: 'object',
      properties: {
        paciente: { type: 'string' },
        edad: { type: 'string' },
        dni: { type: 'string' },
        obra_social: { type: 'string' },
        diagnostico: { type: 'string' },
        procedimiento: { type: 'string' },
        implantes: { type: 'string' },
        instrumental: { type: 'string' },
        urgencia: { type: 'string' },
        medico: { type: 'string' },
        fecha: { type: 'string' }
      },
      required: ['paciente', 'diagnostico', 'procedimiento']
    }
  },
  {
    name: 'pedido_ambulancia',
    description: 'Genera texto para pedido de ambulancia o traslado.',
    inputSchema: {
      type: 'object',
      properties: {
        paciente: { type: 'string' },
        dni: { type: 'string' },
        edad: { type: 'string' },
        obra_social: { type: 'string' },
        origen: { type: 'string' },
        destino: { type: 'string' },
        fecha_hora: { type: 'string' },
        diagnostico: { type: 'string' },
        complejidad: { type: 'string' },
        medico: { type: 'string' },
        observaciones: { type: 'string' }
      },
      required: ['paciente', 'origen', 'destino', 'diagnostico']
    }
  },
  {
    name: 'epicrisis_trauma',
    description: 'Genera una epicrisis traumatológica breve.',
    inputSchema: {
      type: 'object',
      properties: {
        paciente: { type: 'string' },
        edad: { type: 'string' },
        dni: { type: 'string' },
        obra_social: { type: 'string' },
        fecha_ingreso: { type: 'string' },
        fecha_egreso: { type: 'string' },
        diagnostico: { type: 'string' },
        cirugia: { type: 'string' },
        evolucion: { type: 'string' },
        indicaciones: { type: 'string' },
        control: { type: 'string' },
        medico: { type: 'string' }
      },
      required: ['paciente', 'diagnostico']
    }
  },
  {
    name: 'internacion_domiciliaria',
    description: 'Genera texto para solicitud de internación domiciliaria o rehabilitación domiciliaria.',
    inputSchema: {
      type: 'object',
      properties: {
        paciente: { type: 'string' },
        edad: { type: 'string' },
        dni: { type: 'string' },
        obra_social: { type: 'string' },
        diagnostico: { type: 'string' },
        motivo: { type: 'string' },
        complejidad: { type: 'string' },
        duracion: { type: 'string' },
        kinesiologia: { type: 'string' },
        enfermeria: { type: 'string' },
        medico: { type: 'string' }
      },
      required: ['paciente', 'diagnostico', 'motivo']
    }
  }
];

function buildFormularioTrauma(args) {
  return [
    'FORMULARIO TRAUMATOLOGÍA',
    '',
    `Paciente: ${args.paciente || ''}`,
    args.edad ? `Edad: ${args.edad}` : null,
    args.dni ? `DNI: ${args.dni}` : null,
    args.sala_cama ? `Sala/Cama: ${args.sala_cama}` : null,
    `Diagnóstico: ${args.diagnostico || ''}`,
    args.procedimiento ? `Procedimiento/Plan: ${args.procedimiento}` : null,
    args.observaciones ? `Observaciones: ${args.observaciones}` : null
  ].filter(Boolean).join('\n');
}

function buildPedidoProtesisCadera(args) {
  return [
    'PEDIDO DE PRÓTESIS DE CADERA',
    '',
    `Paciente: ${args.paciente || ''}`,
    args.edad ? `Edad: ${args.edad}` : null,
    args.dni ? `DNI: ${args.dni}` : null,
    args.obra_social ? `Obra social: ${args.obra_social}` : null,
    '',
    `Diagnóstico: ${args.diagnostico || ''}`,
    `Procedimiento solicitado: ${args.procedimiento || ''}`,
    '',
    'Materiales / implantes solicitados:',
    args.implantes || '- Completar implantes según planificación.',
    '',
    'Instrumental especial:',
    args.instrumental || '- Instrumental habitual para artroplastia de cadera.',
    '',
    args.urgencia ? `Urgencia / fecha tentativa: ${args.urgencia}` : null,
    args.fecha ? `Fecha: ${args.fecha}` : null,
    '',
    args.medico ? `Médico solicitante: ${args.medico}` : 'Médico solicitante:'
  ].filter(Boolean).join('\n');
}

function buildPedidoAmbulancia(args) {
  return [
    'PEDIDO DE AMBULANCIA / TRASLADO',
    '',
    `Paciente: ${args.paciente || ''}`,
    args.edad ? `Edad: ${args.edad}` : null,
    args.dni ? `DNI: ${args.dni}` : null,
    args.obra_social ? `Obra social: ${args.obra_social}` : null,
    '',
    `Origen: ${args.origen || ''}`,
    `Destino: ${args.destino || ''}`,
    args.fecha_hora ? `Fecha y hora solicitada: ${args.fecha_hora}` : null,
    '',
    `Diagnóstico: ${args.diagnostico || ''}`,
    args.complejidad ? `Complejidad: ${args.complejidad}` : 'Complejidad: baja complejidad / sin médico, salvo indicación contraria.',
    args.observaciones ? `Observaciones: ${args.observaciones}` : null,
    '',
    args.medico ? `Médico solicitante: ${args.medico}` : 'Médico solicitante:'
  ].filter(Boolean).join('\n');
}

function buildEpicrisisTrauma(args) {
  return [
    'EPICRISIS TRAUMATOLÓGICA',
    '',
    `Paciente: ${args.paciente || ''}`,
    args.edad ? `Edad: ${args.edad}` : null,
    args.dni ? `DNI: ${args.dni}` : null,
    args.obra_social ? `Obra social: ${args.obra_social}` : null,
    args.fecha_ingreso ? `Fecha de ingreso: ${args.fecha_ingreso}` : null,
    args.fecha_egreso ? `Fecha de egreso: ${args.fecha_egreso}` : null,
    '',
    `Diagnóstico: ${args.diagnostico || ''}`,
    args.cirugia ? `Cirugía / procedimiento: ${args.cirugia}` : null,
    '',
    'Evolución:',
    args.evolucion || 'Paciente con evolución clínica favorable, lúcido/a, afebril, hemodinámicamente estable, herida quirúrgica sin signos de infección al momento del alta.',
    '',
    'Indicaciones:',
    args.indicaciones || '- Analgesia según indicación médica.\n- Control por consultorio externo.\n- Pautas de alarma.\n- Rehabilitación según tolerancia e indicación traumatológica.',
    '',
    args.control ? `Control: ${args.control}` : null,
    '',
    args.medico ? `Médico: ${args.medico}` : 'Médico:'
  ].filter(Boolean).join('\n');
}

function buildInternacionDomiciliaria(args) {
  return [
    'SOLICITUD DE INTERNACIÓN DOMICILIARIA',
    '',
    `Paciente: ${args.paciente || ''}`,
    args.edad ? `Edad: ${args.edad}` : null,
    args.dni ? `DNI: ${args.dni}` : null,
    args.obra_social ? `Obra social: ${args.obra_social}` : null,
    '',
    `Diagnóstico: ${args.diagnostico || ''}`,
    `Motivo de solicitud: ${args.motivo || ''}`,
    args.complejidad ? `Complejidad: ${args.complejidad}` : 'Complejidad: baja complejidad.',
    args.duracion ? `Duración solicitada: ${args.duracion}` : 'Duración solicitada: 30 días.',
    '',
    args.kinesiologia ? `Kinesiología: ${args.kinesiologia}` : null,
    args.enfermeria ? `Enfermería: ${args.enfermeria}` : null,
    '',
    args.medico ? `Médico solicitante: ${args.medico}` : 'Médico solicitante:'
  ].filter(Boolean).join('\n');
}

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
      endpoint: '/mcp',
      tools: MCP_TOOLS.map(t => t.name)
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
        version: '1.1.0'
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
        content: textContent('✅ estado_markk verificado\n\nMarkk está online.\nEndpoint MCP activo: /mcp 🟢')
      }));
    }

    if (toolName === 'completar_formulario_trauma') {
      return sendJson(res, 200, mcpResponse(id, {
        content: textContent(buildFormularioTrauma(args))
      }));
    }

    if (toolName === 'pedido_protesis_cadera') {
      return sendJson(res, 200, mcpResponse(id, {
        content: textContent(buildPedidoProtesisCadera(args))
      }));
    }

    if (toolName === 'pedido_ambulancia') {
      return sendJson(res, 200, mcpResponse(id, {
        content: textContent(buildPedidoAmbulancia(args))
      }));
    }

    if (toolName === 'epicrisis_trauma') {
      return sendJson(res, 200, mcpResponse(id, {
        content: textContent(buildEpicrisisTrauma(args))
      }));
    }

    if (toolName === 'internacion_domiciliaria') {
      return sendJson(res, 200, mcpResponse(id, {
        content: textContent(buildInternacionDomiciliaria(args))
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
- Identifica todos los campos del FORMULARIO
- Extrae los valores correspondientes de la imagen de DATOS
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

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/mcp') {
    try {
      return await handleMcp(req, res);
    } catch (err) {
      return sendJson(res, 500, { error: err.message || 'Error MCP' });
    }
  }

  if (req.method === 'POST' && urlPath === '/api/analyze') {
    try {
      const raw = await collectBody(req);
      const body = JSON.parse(raw.toString());

      const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'API key requerida.' }));
      }

      const result = await callClaude(
        apiKey,
        body.formImage,
        body.formMime || 'image/jpeg',
        body.dataImage,
        body.dataMime || 'image/jpeg'
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Error interno' }));
    }
    return;
  }

  const filePath = path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
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
