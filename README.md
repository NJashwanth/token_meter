# Token Meter

A VS Code extension that tracks Claude API token consumption in real-time by acting as a transparent proxy between your application and the Anthropic API.

## How It Works

Token Meter sits between your code and the Anthropic API. You point your Claude SDK to `http://localhost:3847` instead of `api.anthropic.com`. The proxy forwards your requests, captures token usage from every response, and displays it in VS Code.

```
Your App  →  Token Meter Proxy (localhost:3847)  →  api.anthropic.com
                     ↓
              Tracks tokens & displays in VS Code
```

## Quick Start

### 1. Start the backend proxy

```bash
cd backend
npm install
npm start
```

The proxy starts on `http://localhost:3847`.

### 2. Set your API key

Open the Token Meter sidebar in VS Code and enter your Claude API key. The key is stored securely using VS Code's SecretStorage (encrypted by your OS).

Get your API key at [console.anthropic.com/account/keys](https://console.anthropic.com/account/keys).

### 3. Point your Claude SDK to the proxy

**Python:**
```python
from anthropic import Anthropic

client = Anthropic(base_url="http://localhost:3847")
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}]
)
```

**JavaScript / TypeScript:**
```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ baseURL: "http://localhost:3847" });
const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
});
```

**cURL:**
```bash
curl http://localhost:3847/v1/messages \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

No API key header needed in your requests — the proxy adds it automatically.

## Features

- **Status Bar** — Shows session input/output token counts, color-coded warnings when approaching thresholds
- **Sidebar Panel** — Session stats, all-time usage, estimated costs, recent activity log
- **Streaming Support** — Tracks tokens from both regular and streaming API responses
- **Secure Key Storage** — API key encrypted via VS Code SecretStorage, never logged in full
- **Session Management** — Reset session counters anytime, all-time stats persist across restarts
- **Cost Estimates** — Approximate cost breakdown based on current Claude model pricing

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tokenMeter.apiKey` | — | Claude API key (stored in SecretStorage) |
| `tokenMeter.backendUrl` | `http://localhost:3847` | Backend proxy URL |
| `tokenMeter.backendPort` | `3847` | Backend proxy port |
| `tokenMeter.refreshInterval` | `2000` | UI refresh interval in ms |
| `tokenMeter.warningThreshold` | `100000` | Token count warning threshold |

## Backend API

The proxy exposes management endpoints alongside the Anthropic API proxy:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Health check, configuration status |
| `/api/configure` | POST | Set API key (`{ "apiKey": "sk-ant-..." }`) |
| `/api/usage` | GET | Session + all-time usage stats |
| `/api/reset-session` | POST | Reset current session counters |
| `/v1/messages` | POST | Proxy to Anthropic Messages API |
| `/v1/messages/count_tokens` | POST | Proxy to token counting endpoint |

Usage data is persisted to `~/.token-meter/usage.json`.

## Project Structure

```
token_meter/
├── src/                          # VS Code extension
│   ├── extension.ts              # Activation, polling, commands
│   ├── api-client.ts             # HTTP client for backend
│   ├── status-bar.ts             # Status bar indicator
│   └── webview/
│       └── sidebar-provider.ts   # Sidebar panel UI
├── backend/                      # Proxy server
│   └── src/
│       ├── server.ts             # Express proxy + management API
│       ├── tracker.ts            # Token tracking + persistence
│       └── types.ts              # Shared type definitions
├── media/                        # Extension icons
└── package.json                  # Extension manifest
```

## Development

```bash
# Extension
npm install
npm run compile    # or: npm run watch

# Backend
cd backend
npm install
npm run build      # or: npm run dev
```

## License

MIT
