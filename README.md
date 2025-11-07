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

All configuration is done via the `proxyConfig` section in your `package.json`.

### Configuration Schema

```typescript
{
  proxyConfig: {
    appPort: number; // Port where Vite dev server runs
    proxyPort: number; // Port where HTTPS proxy runs
    devDomain: string; // Domain alias (must match SSL cert name)
    apiLocal: boolean; // true = local API, false = remote API
    apiBaseUrl: string; // Base URL of the API to proxy to
    certsPath: string; // Path to SSL certificates directory
    showLogs: boolean; // Show/hide proxy request logs
  }
}
```

### Example Configuration

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

### Configuration Options Explained

| Option       | Required | Default | Description                                                            |
| ------------ | -------- | ------- | ---------------------------------------------------------------------- |
| `appPort`    | **Yes**  | -       | Port where your Vite dev server runs (e.g., 5173)                      |
| `proxyPort`  | **Yes**  | -       | Port where the HTTPS proxy listens (e.g., 8443)                        |
| `devDomain`  | **Yes**  | -       | Domain alias for local dev. Must match SSL certificate common name     |
| `apiLocal`   | No       | `false` | When `true`, disables SSL verification for local self-signed API certs |
| `apiBaseUrl` | **Yes**  | -       | Full base URL of the API (e.g., `https://api.example.com`)             |
| `certsPath`  | **Yes**  | -       | Relative or absolute path to directory containing SSL certificates     |
| `showLogs`   | No       | `true`  | When `true`, logs all proxy requests and responses to console          |

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

### "proxyConfig not found in package.json"

**Cause:** The `proxyConfig` section is missing from your `package.json`.

**Solution:** Add the `proxyConfig` section with all required fields.

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

You can run multiple Svelte apps with different domain aliases:

**App 1 (`app1.dev-example.com`):**

```json
{
  "proxyConfig": {
    "appPort": 5173,
    "proxyPort": 8443,
    "devDomain": "app1.dev-example.com"
  }
}
```

**App 2 (`app2.dev-example.com`):**

```json
{
  "proxyConfig": {
    "appPort": 5174,
    "proxyPort": 8444,
    "devDomain": "app2.dev-example.com"
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

## License

MIT

## Contributing

Issues and PRs welcome at [https://github.com/eduardocgarza/svelte-api-proxy](https://github.com/eduardocgarza/svelte-api-proxy)
