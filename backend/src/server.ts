#!/usr/bin/env node

import express from 'express';
import { TokenTracker } from './tracker';
import { TokenUsage } from './types';

const PORT = parseInt(process.env.TOKEN_METER_PORT ?? '3847', 10);
const app = express();
const tracker = new TokenTracker();

app.use(express.json());

// CORS for local VS Code extension requests
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/usage', (_req, res) => {
  res.json(tracker.getUsage());
});

app.get('/api/session', (_req, res) => {
  res.json(tracker.getSession());
});

app.post('/api/reset', (_req, res) => {
  tracker.resetSession();
  res.json({ status: 'ok', session: tracker.getSession() });
});

app.post('/api/track', (req, res) => {
  const { model, usage } = req.body as { model?: string; usage?: TokenUsage };
  if (!model || !usage) {
    res.status(400).json({ error: 'Missing model or usage fields' });
    return;
  }
  const tokenUsage: TokenUsage = {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    cache_read_tokens: usage.cache_read_tokens ?? 0,
    cache_creation_tokens: usage.cache_creation_tokens ?? 0,
  };
  tracker.recordUsage(model, tokenUsage);
  res.json({ status: 'ok' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Token Meter tracker running on http://127.0.0.1:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET  /api/status  - Health check`);
  console.log(`  GET  /api/usage   - All usage stats`);
  console.log(`  GET  /api/session - Current session stats`);
  console.log(`  POST /api/track   - Record token usage`);
  console.log(`  POST /api/reset   - Reset current session`);
});
