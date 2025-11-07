# Quick Start Guide

Complete installation and setup guide for svelte-api-proxy.

## Overview

This guide will help you set up HTTPS local development with a reverse proxy that routes API requests to a remote or local backend while serving your Svelte app locally.

**What you'll accomplish:**

1. Choose and configure a domain alias (e.g., `dev-example.com`)
2. Generate SSL certificates for HTTPS
3. Configure your Svelte app and proxy
4. Run your app with HTTPS and API proxying

---

## Prerequisites

- Node.js 16+ and npm
- A Svelte/Vite project
- [mkcert](https://github.com/FiloSottile/mkcert) for SSL certificates

---

## Step 1: Choose a Domain Alias

A **domain alias** allows you to use a custom domain locally instead of `localhost`. This is useful for:

- Cookie sharing between subdomains
- Simulating production domain structure
- Avoiding CORS issues

### How Domain Aliases Work

You'll map a custom domain to `127.0.0.1` (localhost) in your `/etc/hosts` file, making your browser treat it as a real domain.

### Common Pattern

**Root domain** for your main site:

```
127.0.0.1   dev-example.com
```

**Subdomains** for different apps:

```
127.0.0.1   auth.dev-example.com
127.0.0.1   app1.dev-example.com
127.0.0.1   app2.dev-example.com
```

**API subdomain** for your backend:

```
127.0.0.1   api.dev-example.com
```

### Benefits of Same-Domain Setup

Using a parent domain with subdomains allows you to:

- Share cookies across all subdomains (set `domain=.dev-example.com`)
- Avoid CORS preflight requests between same-site origins
- Mirror your production domain structure

### Example Configurations

**Example 1: Standard TLD**

```bash
# /etc/hosts
127.0.0.1   dev-myapp.com
127.0.0.1   auth.dev-myapp.com
127.0.0.1   dashboard.dev-myapp.com
127.0.0.1   api.dev-myapp.com
```

**Example 2: Custom TLD**

```bash
# /etc/hosts
127.0.0.1   dev-bananas.local
127.0.0.1   auth.dev-bananas.local
127.0.0.1   app.dev-bananas.local
127.0.0.1   api.dev-bananas.local
```

### Editing /etc/hosts

**macOS/Linux:**

```bash
sudo nano /etc/hosts
```

**Windows:**

```
C:\Windows\System32\drivers\etc\hosts
(Open Notepad as Administrator)
```

Add your entries, save, and close.

---

## Step 2: Install mkcert

Install mkcert to generate locally-trusted SSL certificates.

### macOS

```bash
brew install mkcert
mkcert -install
```

### Linux

```bash
sudo apt install libnss3-tools
wget https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64
chmod +x mkcert-v1.4.4-linux-amd64
sudo mv mkcert-v1.4.4-linux-amd64 /usr/local/bin/mkcert
mkcert -install
```

### Windows

```bash
choco install mkcert
mkcert -install
```

### Verify Installation

```bash
mkcert -version
```

---

## Step 3: Generate SSL Certificates

Create a `certs` directory in your project root and generate certificates for your domain alias.

```bash
mkdir certs
cd certs
mkcert dev-example.com
```

This creates:

- `dev-example.com.pem` (certificate)
- `dev-example.com-key.pem` (private key)

**Important:** Add `./certs` to your `.gitignore`:

```bash
echo "certs/" >> .gitignore
```

---

## Step 4: Install svelte-api-proxy

Install the proxy package and concurrently:

```bash
npm install --save-dev svelte-api-proxy concurrently
```

---

## Step 5: Configure Vite

Set your Vite dev server port explicitly in `vite.config.js`:

```javascript
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173, // Vite runs on this port
    strictPort: true, // Fail if port is already in use
    host: "127.0.0.1", // Listen on localhost only
  },
});
```

**Why these settings?**

- `port: 5173` - Vite runs here (not accessed directly by browser)
- `host: "127.0.0.1"` - Only accessible from localhost (security)
- Browser accesses proxy at `https://dev-example.com:8443`
- Proxy forwards to Vite at `http://localhost:5173`

---

## Step 6: Configure Proxy in package.json

Add a `proxyConfig` section to your `package.json`:

```json
{
  "name": "my-svelte-app",
  "proxyConfig": {
    "appPort": 5173,
    "proxyPort": 8443,
    "devDomain": "dev-example.com",
    "apiLocal": false,
    "apiBaseUrl": "https://api.example.com",
    "certsPath": "./certs",
    "showLogs": true
  },
  "scripts": {
    "dev": "concurrently -n APP,PROXY -c cyan,magenta \"npm run dev:app\" \"npm run dev:proxy\"",
    "dev:app": "vite dev",
    "dev:proxy": "svelte-api-proxy"
  },
  "devDependencies": {
    "svelte-api-proxy": "^1.0.0",
    "concurrently": "^9.0.0"
  }
}
```

### Configuration Explained

| Field        | Value                     | Description                                              |
| ------------ | ------------------------- | -------------------------------------------------------- |
| `appPort`    | `5173`                    | Port where Vite runs                                     |
| `proxyPort`  | `8443`                    | Port where HTTPS proxy runs (what you access in browser) |
| `devDomain`  | `dev-example.com`         | Your domain alias (must match SSL cert)                  |
| `apiLocal`   | `false`                   | `false` = remote API, `true` = local API                 |
| `apiBaseUrl` | `https://api.example.com` | Your API's base URL                                      |
| `certsPath`  | `./certs`                 | Path to SSL certificates directory                       |
| `showLogs`   | `true`                    | Show proxy request logs                                  |

---

## Step 7: Configure Your API Client

Update your API client to use the proxy in development.

### Example with Axios

```javascript
import axios from "axios";

const API_BASE_URL = "https://api.example.com"; // Remote API URL
const DEV_MODE = import.meta.env.DEV; // Vite's dev mode flag

export const api = axios.create({
  // In dev: use "/api" (proxy routes it)
  // In prod: use full API URL
  baseURL: DEV_MODE ? "/api" : `${API_BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Important: includes cookies
});
```

### How It Works

**Development:**

- Your code makes request to `/api/users`
- Proxy intercepts and forwards to `https://api.example.com/api/users`
- Cookies and headers are preserved

**Production:**

- Your code makes request to `https://api.example.com/api/users`
- No proxy involved, direct API call

### Example API Usage

```javascript
// Get users
const response = await api.get("/users");

// Login
const response = await api.post("/auth/login", {
  email: "user@example.com",
  password: "password123",
});
```

---

## Step 8: Run Your App

Start both the Vite dev server and the proxy:

```bash
npm run dev
```

You should see:

```
[APP] VITE v5.0.0 ready in 500 ms
[APP] ➜ Local: http://127.0.0.1:5173/
[PROXY] Starting HTTPS dev proxy...
[PROXY] API target → REMOTE (https://api.example.com)
[PROXY] HTTPS server → https://dev-example.com:8443
[PROXY] App → http://localhost:5173
[PROXY] API → https://api.example.com
```

**Access your app at:** `https://dev-example.com:8443`

---

## Step 9: Test API Requests

Open your browser's Developer Tools (Network tab) and make an API request from your app.

You should see:

1. Browser request to `/api/users`
2. Proxy log: `[PROXY] GET /api/users → https://api.example.com/api/users`
3. Proxy log: `[PROXY] Response: 200 GET /api/users`
4. Response in browser

---

## Switching Between Local and Remote API

### For Remote/Staging API:

```json
{
  "proxyConfig": {
    "apiLocal": false,
    "apiBaseUrl": "https://api.example.com"
  }
}
```

### For Local API:

```json
{
  "proxyConfig": {
    "apiLocal": true,
    "apiBaseUrl": "https://api.dev-example.com:3000"
  }
}
```

When `apiLocal: true`, the proxy disables SSL verification, allowing self-signed certificates on your local API.

---

## Complete Example

Here's a full working example:

### Directory Structure

```
my-svelte-app/
├── certs/
│   ├── dev-myapp.local.pem
│   └── dev-myapp.local-key.pem
├── src/
│   ├── lib/
│   │   └── api.js
│   └── App.svelte
├── package.json
├── vite.config.js
└── .gitignore
```

### /etc/hosts

```
127.0.0.1   dev-myapp.local
```

### package.json

```json
{
  "name": "my-svelte-app",
  "proxyConfig": {
    "appPort": 5173,
    "proxyPort": 8443,
    "devDomain": "dev-myapp.local",
    "apiLocal": false,
    "apiBaseUrl": "https://api.myapp.com",
    "certsPath": "./certs",
    "showLogs": true
  },
  "scripts": {
    "dev": "concurrently -n APP,PROXY -c cyan,magenta \"npm run dev:app\" \"npm run dev:proxy\"",
    "dev:app": "vite dev",
    "dev:proxy": "svelte-api-proxy"
  },
  "devDependencies": {
    "svelte-api-proxy": "^1.0.0",
    "concurrently": "^9.0.0"
  }
}
```

### vite.config.js

```javascript
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
});
```

### src/lib/api.js

```javascript
import axios from "axios";

const API_BASE_URL = "https://api.myapp.com";
const DEV_MODE = import.meta.env.DEV;

export const api = axios.create({
  baseURL: DEV_MODE ? "/api" : `${API_BASE_URL}/api`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});
```

### src/App.svelte

```svelte
<script>
  import { api } from "./lib/api";
  import { onMount } from "svelte";

  let users = [];

  onMount(async () => {
    const response = await api.get("/users");
    users = response.data;
  });
</script>

<main>
  <h1>Users</h1>
  <ul>
    {#each users as user}
      <li>{user.name}</li>
    {/each}
  </ul>
</main>
```

### Run

```bash
npm run dev
```

### Access

Open `https://dev-myapp.local:8443` in your browser.

---

## Troubleshooting

### Browser Shows "Not Secure" Warning

**Cause:** Certificate not trusted by browser.

**Solution:** Run `mkcert -install` and restart your browser.

### Port Already in Use

**Cause:** Another process is using port 5173 or 8443.

**Solution:**

```bash
# Find process using port
lsof -ti:5173
lsof -ti:8443

# Kill process
kill -9 <PID>
```

Or change ports in `proxyConfig` and `vite.config.js`.

### Cannot Access https://dev-example.com:8443

**Cause:** Domain alias not configured or browser cache.

**Solution:**

1. Verify `/etc/hosts` entry exists
2. Ping domain: `ping dev-example.com` (should resolve to 127.0.0.1)
3. Clear browser cache
4. Try in incognito mode

### API Requests Return 503

**Cause:** Remote API is down or unreachable.

**Solution:**

1. Test API directly: `curl https://api.example.com/api/health`
2. Check `apiBaseUrl` is correct
3. Verify API server is running

### CORS Errors

**Cause:** API is rejecting requests from your dev domain.

**Solution:** Configure your API's CORS settings to allow `https://dev-example.com:8443`.

---

## Next Steps

- Read the [README.md](./README.md) for detailed API documentation
- Set up multiple Svelte apps with different subdomains
- Configure cookie sharing across subdomains
- Deploy your app (proxy is dev-only, not needed in production)

---

## Summary

You now have:

- ✅ HTTPS local development with a custom domain
- ✅ API requests proxied to remote/local backend
- ✅ Cookie and header preservation
- ✅ WebSocket support for HMR
- ✅ Clean separation between dev and production API calls

**Your app runs at:** `https://dev-example.com:8443`  
**API requests go to:** `https://api.example.com`  
**Vite runs at:** `http://localhost:5173` (internal only)
