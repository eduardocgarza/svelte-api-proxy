# svelte-api-proxy

A self-signed HTTPS reverse proxy for Svelte/Vite dev servers that routes `/api/*` requests to a configurable **local** or **staging** backend while preserving cookies, headers, and SPA fallback.

## Features

- **HTTPS support** - Self-signed certificates for local HTTPS development
- **API routing** - Routes `/api/*` requests to local or remote API
- **Cookie preservation** - Maintains cookies between proxy and API
- **WebSocket support** - Full WebSocket proxying for HMR and live reload
- **SPA fallback** - Client-side routing support for single-page applications
- **Environment injection** - Adds `x-app-environment: local` header to staging requests
- **Configurable logging** - Toggle request/response logs on/off
- **Host header management** - Properly handles Host header for remote APIs

## Installation

```bash
npm install --save-dev svelte-api-proxy concurrently
```

## Quick Start

See [QUICK_START.md](./QUICK_START.md) for a complete installation and configuration guide.

## How It Works

### Architecture

```
Browser (https://dev-example.com:8443)
    ↓
HTTPS Proxy Server (port 8443)
    ↓
    ├── /api/* requests → Remote/Local API (e.g., https://api.example.com)
    └── All other requests → Vite Dev Server (http://localhost:5173)
```

### Request Flow

1. **Browser makes request** to `https://dev-example.com:8443`
2. **Proxy receives request** and inspects the URL path
3. **Routing decision**:
   - If path starts with `/api/` → Forward to configured API
   - If path is `/`, `/@vite/*`, or contains `.` → Forward to Vite
   - Otherwise → SPA fallback (serve `/`)
4. **Header management**:
   - Strips `Host` header to avoid routing conflicts
   - Adds `x-app-environment: local` for non-local APIs
   - Preserves all cookies and custom headers
5. **Response forwarding** back to browser with all headers intact

### WebSocket Handling

The proxy automatically upgrades WebSocket connections:

- `/api/*` WebSockets → Forwarded to API
- Other WebSockets → Forwarded to Vite (for HMR)

## Configuration

All configuration is done via environment variables with the `PROXY_` prefix.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROXY_APP_PORT` | **Yes** | - | Port where your Vite dev server runs (e.g., 5173) |
| `PROXY_PORT` | **Yes** | - | Port where the HTTPS proxy listens (e.g., 8443) |
| `PROXY_DEV_DOMAIN` | **Yes** | - | Domain alias for local dev. Must match SSL certificate common name |
| `PROXY_API_LOCAL` | No | `false` | When `true`, disables SSL verification for local self-signed API certs |
| `PROXY_API_BASE_URL` | **Yes** | - | Full base URL of the API (e.g., `https://api.example.com`) |
| `PROXY_CERTS_PATH` | **Yes** | - | Relative or absolute path to directory containing SSL certificates |
| `PROXY_SHOW_LOGS` | No | `true` | When `true`, logs all proxy requests and responses to console |

### Example .env File

Create a `.env` file in your project root:

```env
# Proxy Configuration
PROXY_APP_PORT=5173
PROXY_PORT=8443
PROXY_DEV_DOMAIN=dev-example.com
PROXY_API_LOCAL=false
PROXY_API_BASE_URL=https://api.example.com
PROXY_CERTS_PATH=./certs
PROXY_SHOW_LOGS=true
```

### Loading Environment Variables

This package expects environment variables to be set before the CLI runs. Use one of these approaches:

**Option 1: dotenv with node -r flag**
```json
{
  "scripts": {
    "dev:proxy": "node -r dotenv/config ./node_modules/.bin/svelte-api-proxy"
  }
}
```

**Option 2: dotenv-cli**
```bash
npm install --save-dev dotenv-cli
```

```json
{
  "scripts": {
    "dev:proxy": "dotenv -- svelte-api-proxy"
  }
}
```

**Option 3: Shell export**
```bash
export PROXY_APP_PORT=5173
export PROXY_PORT=8443
# ... etc
svelte-api-proxy
```

**Important:** Add `.env` to your `.gitignore`:
```bash
echo ".env" >> .gitignore
```

## SSL Certificates

### Certificate Requirements

The proxy requires two files in your `certsPath` directory:

- `{devDomain}-key.pem` - Private key
- `{devDomain}.pem` - Certificate

**Example:** If `devDomain` is `dev-example.com`:

- `dev-example.com-key.pem`
- `dev-example.com.pem`

### Generating Certificates with mkcert

Install mkcert:

```bash
# macOS
brew install mkcert

# Linux
sudo apt install mkcert

# Windows
choco install mkcert
```

Generate certificates:

```bash
cd certs
mkcert -install
mkcert dev-example.com
```

This creates:

- `dev-example.com.pem` (certificate)
- `dev-example.com-key.pem` (private key)

**Important:** Add `./certs` to your `.gitignore` to avoid committing certificates.

## API Reference

### DevProxy Class

The main proxy server class.

#### Constructor

```javascript
import { DevProxy } from "svelte-api-proxy";

const proxy = new DevProxy(config);
```

**Parameters:**

- `config` (object) - Configuration object with required fields:
  - `appPort` (number)
  - `proxyPort` (number)
  - `devDomain` (string)
  - `apiBaseUrl` (string)
  - `certsPath` (string)
  - `apiLocal` (boolean, optional, default: `false`)
  - `showLogs` (boolean, optional, default: `true`)

**Throws:**

- Error if any required field is missing
- Error if SSL certificates are not found

#### Methods

##### `start()`

Starts the HTTPS proxy server.

```javascript
proxy.start();
```

**Output:**

```
[PROXY] Starting HTTPS dev proxy...
[PROXY] API target → REMOTE (https://api.example.com)
[PROXY] HTTPS server → https://dev-example.com:8443
[PROXY] App → http://localhost:5173
[PROXY] API → https://api.example.com
```

##### `stop()`

Stops the proxy server.

```javascript
proxy.stop();
```

## Header Management

### Host Header

The proxy automatically strips the `Host` header from forwarded requests to prevent routing conflicts. When you access `https://dev-example.com:8443`, the browser sends:

```
Host: dev-example.com:8443
```

If forwarded as-is to `api.example.com`, the remote server would reject it. The proxy strips this header and lets `http-proxy`'s `changeOrigin: true` set the correct `Host` header.

### x-app-environment Header

When `apiLocal` is `false` (staging/production API), the proxy adds:

```
x-app-environment: local
```

This allows your API to differentiate between requests from local development vs deployed apps.

## Logging

When `showLogs` is `true`, the proxy logs:

**Request:**

```
[PROXY] GET /api/users → https://api.example.com/api/users
```

**Response:**

```
[PROXY] Response: 200 GET /api/users
```

Set `showLogs: false` to disable logging.

## Programmatic Usage

For advanced use cases, you can use the proxy programmatically:

```javascript
import { DevProxy } from "svelte-api-proxy";

const proxy = new DevProxy({
  appPort: 5173,
  proxyPort: 8443,
  devDomain: "dev-example.com",
  apiLocal: false,
  apiBaseUrl: "https://api.example.com",
  certsPath: "./certs",
  showLogs: true,
});

proxy.start();

// Later...
proxy.stop();
```

## Troubleshooting

### "PROXY_APP_PORT environment variable is required"

**Cause:** Required environment variables are not set.

**Solution:**
1. Create a `.env` file in your project root with all required `PROXY_*` variables
2. Ensure dotenv is loading before the CLI runs (see Configuration section)
3. Verify your npm script uses `node -r dotenv/config` or `dotenv --`

### "SSL key not found at: ..."

**Cause:** SSL certificates are missing or incorrectly named.

**Solution:**

1. Verify `certsPath` points to the correct directory
2. Ensure certificate files match the pattern: `{devDomain}-key.pem` and `{devDomain}.pem`
3. Regenerate certificates if needed

### 503 Service Unavailable

**Cause:** The remote API is not responding.

**Solution:**

1. Verify `apiBaseUrl` is correct
2. Test API directly: `curl https://api.example.com/api/health`
3. Check API server logs
4. Ensure your network allows outbound HTTPS

### Certificate Warnings in Browser

**Cause:** Browser doesn't trust self-signed certificate.

**Solution:** Run `mkcert -install` to install the local CA in your browser's trust store.

### CORS Errors

**Cause:** API is rejecting requests due to CORS policy.

**Solution:** Since the proxy forwards requests from `localhost`, your API must allow requests from your dev domain origin. Configure CORS on your API to allow `https://dev-example.com:8443`.

### WebSocket Connection Failed

**Cause:** WebSocket upgrade not being handled correctly.

**Solution:**

1. Verify Vite's WebSocket port matches `appPort`
2. Check browser console for WebSocket errors
3. Ensure no firewall is blocking WebSocket connections

## Advanced Topics

### Using with Multiple Svelte Apps

You can run multiple Svelte apps with different domain aliases using separate `.env` files:

**App 1 (`.env.app1`):**

```env
PROXY_APP_PORT=5173
PROXY_PORT=8443
PROXY_DEV_DOMAIN=app1.dev-example.com
PROXY_API_BASE_URL=https://api.example.com
PROXY_CERTS_PATH=./certs
```

**App 2 (`.env.app2`):**

```env
PROXY_APP_PORT=5174
PROXY_PORT=8444
PROXY_DEV_DOMAIN=app2.dev-example.com
PROXY_API_BASE_URL=https://api.example.com
PROXY_CERTS_PATH=./certs
```

Run with specific env file:
```json
{
  "scripts": {
    "dev:app1": "dotenv -e .env.app1 -- svelte-api-proxy",
    "dev:app2": "dotenv -e .env.app2 -- svelte-api-proxy"
  }
}
```

### Cookie Sharing Between Apps

Use a common parent domain for cookie sharing:

```
# /etc/hosts
127.0.0.1   dev-example.com
127.0.0.1   app1.dev-example.com
127.0.0.1   app2.dev-example.com
127.0.0.1   api.dev-example.com
```

Set cookies with `domain=.dev-example.com` to share across all subdomains.

## Migrating from v1.x to v2.x

Version 2.0 changes configuration from `package.json` to environment variables.

### Step 1: Create .env file

Move your `proxyConfig` values to a `.env` file:

**Before (package.json):**
```json
{
  "proxyConfig": {
    "appPort": 5173,
    "proxyPort": 8443,
    "devDomain": "dev-example.com",
    "apiLocal": false,
    "apiBaseUrl": "https://api.example.com",
    "certsPath": "./certs",
    "showLogs": true
  }
}
```

**After (.env):**
```env
PROXY_APP_PORT=5173
PROXY_PORT=8443
PROXY_DEV_DOMAIN=dev-example.com
PROXY_API_LOCAL=false
PROXY_API_BASE_URL=https://api.example.com
PROXY_CERTS_PATH=./certs
PROXY_SHOW_LOGS=true
```

### Step 2: Install dotenv

```bash
npm install --save-dev dotenv
```

### Step 3: Update npm scripts

```json
{
  "scripts": {
    "dev:proxy": "node -r dotenv/config ./node_modules/.bin/svelte-api-proxy"
  }
}
```

### Step 4: Remove proxyConfig from package.json

Delete the `proxyConfig` section from your `package.json`.

### Step 5: Add .env to .gitignore

```bash
echo ".env" >> .gitignore
```

## License

MIT

## Contributing

Issues and PRs welcome at [https://github.com/eduardocgarza/svelte-api-proxy](https://github.com/eduardocgarza/svelte-api-proxy)
