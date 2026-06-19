#!/usr/bin/env node

import express from 'express';
import * as https from 'https';
import { TokenTracker } from './tracker';
import { CallRecord } from './types';

const PORT = parseInt(process.env.TOKEN_METER_PORT ?? '3847', 10);
const ANTHROPIC_HOST = 'api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

const app = express();
const tracker = new TokenTracker();

app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Management endpoints ──

app.get('/api/status', (_req, res) => {
  res.json({
    status: 'running',
    isConfigured: tracker.isConfigured(),
    backendUrl: `http://localhost:${PORT}`,
  });
});

app.post('/api/configure', async (req, res) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    res.status(400).json({ success: false, error: 'Invalid API key format' });
    return;
  }

  try {
    const valid = await validateApiKey(apiKey);
    if (!valid) {
      res.status(401).json({ success: false, error: 'API key is invalid or expired' });
      return;
    }
    tracker.configure(apiKey);
    console.log('[config] API key configured successfully');
    res.json({ success: true, status: 'configured' });
  } catch (err) {
    console.error('[config] Validation error:', err);
    res.status(503).json({ success: false, error: 'Could not reach Anthropic API' });
  }
});

app.get('/api/usage', (_req, res) => {
  res.json(tracker.getUsage());
});

app.post('/api/reset-session', (_req, res) => {
  const usage = tracker.resetSession();
  res.json({ success: true, ...usage });
});

// ── Proxy endpoints ──

app.post('/v1/messages', (req, res) => proxyRequest(req, res, '/v1/messages'));
app.post('/v1/messages/count_tokens', (req, res) => proxyRequest(req, res, '/v1/messages/count_tokens'));

// Catch-all for other Anthropic API paths
app.all('/v1/*', (req, res) => proxyRequest(req, res, req.path));

function proxyRequest(
  clientReq: express.Request,
  clientRes: express.Response,
  path: string
): void {
  const apiKey = tracker.getApiKey();
  if (!apiKey) {
    clientRes.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: 'Token Meter: No API key configured. Set your key in the VS Code extension.' },
    });
    return;
  }

  const body = JSON.stringify(clientReq.body);
  const isStreaming = clientReq.body?.stream === true;
  const model = clientReq.body?.model ?? 'unknown';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': clientReq.headers['anthropic-version'] as string ?? ANTHROPIC_VERSION,
    'Content-Length': Buffer.byteLength(body).toString(),
  };

  // Forward anthropic-specific headers
  for (const [key, val] of Object.entries(clientReq.headers)) {
    if (key.startsWith('anthropic-') && key !== 'anthropic-version' && typeof val === 'string') {
      headers[key] = val;
    }
  }

  const proxyReq = https.request(
    { hostname: ANTHROPIC_HOST, port: 443, path, method: 'POST', headers },
    (proxyRes) => {
      if (isStreaming) {
        handleStreamingResponse(proxyRes, clientRes, model, path);
      } else {
        handleJsonResponse(proxyRes, clientRes, model, path);
      }
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[proxy] Request error:', err.message);
    clientRes.status(503).json({
      type: 'error',
      error: { type: 'api_error', message: 'Could not reach Anthropic API: ' + err.message },
    });
  });

  proxyReq.write(body);
  proxyReq.end();
}

function handleJsonResponse(
  proxyRes: import('http').IncomingMessage,
  clientRes: express.Response,
  model: string,
  method: string
): void {
  let data = '';
  proxyRes.on('data', (chunk) => { data += chunk; });
  proxyRes.on('end', () => {
    // Forward status and headers
    clientRes.status(proxyRes.statusCode ?? 200);
    for (const [key, val] of Object.entries(proxyRes.headers)) {
      if (val) { clientRes.setHeader(key, val); }
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed.usage && proxyRes.statusCode === 200) {
        recordUsageFromResponse(parsed, model, method);
      }
      clientRes.json(parsed);
    } catch {
      clientRes.send(data);
    }
  });
}

function handleStreamingResponse(
  proxyRes: import('http').IncomingMessage,
  clientRes: express.Response,
  model: string,
  method: string
): void {
  clientRes.status(proxyRes.statusCode ?? 200);
  clientRes.setHeader('Content-Type', 'text/event-stream');
  clientRes.setHeader('Cache-Control', 'no-cache');
  clientRes.setHeader('Connection', 'keep-alive');

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let resolvedModel = model;

  proxyRes.on('data', (chunk) => {
    const text = chunk.toString();
    clientRes.write(chunk);

    // Parse SSE lines to capture usage from message_delta and message_start events
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) { continue; }
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') { continue; }
      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens ?? 0;
          cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
          cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
          if (event.message.model) { resolvedModel = event.message.model; }
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens ?? 0;
        }
      } catch {
        // not valid JSON, skip
      }
    }
  });

  proxyRes.on('end', () => {
    clientRes.end();
    if (inputTokens > 0 || outputTokens > 0) {
      const record: CallRecord = {
        timestamp: new Date().toISOString(),
        model: resolvedModel,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        method: `POST ${method}`,
      };
      tracker.recordCall(record);
      console.log(`[track] ${resolvedModel} — in:${inputTokens} out:${outputTokens} cache_r:${cacheReadTokens} cache_w:${cacheCreationTokens}`);
    }
  });
}

function recordUsageFromResponse(parsed: any, model: string, method: string): void {
  const u = parsed.usage;
  const record: CallRecord = {
    timestamp: new Date().toISOString(),
    model: parsed.model ?? model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    method: `POST ${method}`,
  };
  tracker.recordCall(record);
  console.log(`[track] ${record.model} — in:${record.inputTokens} out:${record.outputTokens} cache_r:${record.cacheReadTokens} cache_w:${record.cacheCreationTokens}`);
}

function validateApiKey(apiKey: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'claude-haiku-4-5-20241022', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
    const req = https.request(
      {
        hostname: ANTHROPIC_HOST,
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Length': Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          // 200 = valid, 401/403 = invalid key, anything else = maybe valid but API issue
          if (res.statusCode === 200) { resolve(true); }
          else if (res.statusCode === 401 || res.statusCode === 403) { resolve(false); }
          else { resolve(true); } // credit issues etc. — key itself is valid
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\nToken Meter proxy running on http://127.0.0.1:${PORT}\n`);
  console.log('Management:');
  console.log(`  POST /api/configure     — Set API key`);
  console.log(`  GET  /api/status        — Health check`);
  console.log(`  GET  /api/usage         — Usage stats`);
  console.log(`  POST /api/reset-session — Reset session\n`);
  console.log('Proxy (point your Claude SDK here):');
  console.log(`  POST /v1/messages`);
  console.log(`  POST /v1/messages/count_tokens\n`);
});
