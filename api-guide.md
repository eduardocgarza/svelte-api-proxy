# API Server Setup Guide

Configuration guide for your Express/Node.js API server to work with svelte-api-proxy. This covers CORS, HTTPS in development, and cookie domain configuration.

---

## Overview

Your API server needs three key configurations:

1. **CORS** - Allow cross-origin requests from your Svelte apps
2. **HTTPS in Development** - Run with SSL certificates locally
3. **Cookie Domain Configuration** - Share cookies across subdomains

---

## Prerequisites

- Node.js 16+ and npm
- Express.js
- [mkcert](https://github.com/FiloSottile/mkcert) for SSL certificates (same as client setup)

---

## Step 1: Install Dependencies

```bash
npm install express cors cookie-parser dotenv
```

---

## Step 2: Generate SSL Certificates for API

Your API needs its own SSL certificate. If your API runs at `api.dev-example.com:3000`:

```bash
cd certs  # or wherever you store certificates
mkcert api.dev-example.com
```

This creates:

- `api.dev-example.com.pem` (certificate)
- `api.dev-example.com-key.pem` (private key)

---

## Step 3: Configure /etc/hosts

Add your API domain to `/etc/hosts`:

```bash
# /etc/hosts
127.0.0.1   api.dev-example.com
```

---

## Step 4: Environment Variables

Create a `.env` file in your API project root:

```bash
# .env
NODE_ENV=development
PORT=3000

# Your domain configuration
DEV_DOMAIN=dev-example.com
STAG_DOMAIN=example.dev
PROD_DOMAIN=example.com
```

---

## Step 5: CORS Configuration

Create `config/cors.js`:

```javascript
import { APP_URLS } from "./domains.js";

const ENV_MODE_DEVELOPMENT = process.env.NODE_ENV === "development";
const ENV_MODE_STAGING = process.env.NODE_ENV === "staging";

// Development URLs (with ports)
const DEV_URLS = {
  AUTH: "https://auth.dev-example.com:8443",
  ADMIN: "https://admin.dev-example.com:8444",
  APP: "https://app.dev-example.com:8445",
  SITE: "https://dev-example.com:8446",
};

// Staging URLs (no ports)
const STAG_URLS = {
  AUTH: "https://auth.example.dev",
  ADMIN: "https://admin.example.dev",
  APP: "https://app.example.dev",
  SITE: "https://example.dev",
};

// Production URLs
const PROD_URLS = {
  AUTH: "https://auth.example.com",
  ADMIN: "https://admin.example.com",
  APP: "https://app.example.com",
  SITE: "https://example.com",
};

function getAllowedOrigins() {
  if (ENV_MODE_DEVELOPMENT) {
    return Object.values(DEV_URLS);
  }

  if (ENV_MODE_STAGING) {
    // In staging, allow both staging and dev origins
    return [...Object.values(STAG_URLS), ...Object.values(DEV_URLS)];
  }

  // Production
  return Object.values(PROD_URLS);
}

const allowedOrigins = getAllowedOrigins();

export const CORS_OPTIONS = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true, // CRITICAL: Required for cookies
};
```

---

## Step 6: Cookie Domain Configuration

Create `utils/cookies.js`:

```javascript
const ENV_MODE_DEVELOPMENT = process.env.NODE_ENV === "development";
const ENV_MODE_STAGING = process.env.NODE_ENV === "staging";

const DOMAINS = {
  DEV: process.env.DEV_DOMAIN || "dev-example.com",
  STAG: process.env.STAG_DOMAIN || "example.dev",
  PROD: process.env.PROD_DOMAIN || "example.com",
};

/**
 * Determines if cookies should use secure flag
 * In dev with svelte-api-proxy, the proxy adds 'x-app-environment: local' header
 */
export function resolveSecureFlag(req) {
  const isLocalDev = req.headers["x-app-environment"] === "local";
  return !(ENV_MODE_DEVELOPMENT || isLocalDev);
}

/**
 * Determines the cookie domain based on environment
 * Uses a leading dot (e.g., '.dev-example.com') to share across subdomains
 */
export function resolveCookieDomain(req) {
  const isLocalDev = req.headers["x-app-environment"] === "local";

  if (ENV_MODE_STAGING && isLocalDev) {
    // Developer using svelte-api-proxy to hit staging API from local domain
    return `.${DOMAINS.DEV}`;
  }

  if (ENV_MODE_DEVELOPMENT) {
    return `.${DOMAINS.DEV}`;
  }

  if (ENV_MODE_STAGING) {
    return `.${DOMAINS.STAG}`;
  }

  return `.${DOMAINS.PROD}`;
}

/**
 * Sets a cookie with environment-appropriate settings
 */
export function setCookie(req, res, name, value, options = {}) {
  const domain = resolveCookieDomain(req);
  const secure = resolveSecureFlag(req);

  const cookieOptions = {
    httpOnly: true,
    domain,
    secure,
    sameSite: "lax",
    path: "/",
    ...options,
  };

  res.cookie(name, value, cookieOptions);
}
```

---

## Step 7: HTTPS Server Configuration

Create `config/server.js`:

```javascript
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_MODE_DEVELOPMENT = process.env.NODE_ENV === "development";

/**
 * Starts HTTPS server in development mode
 */
export function startDevHttpsServer(app, port, subdomain) {
  const domain = process.env.DEV_DOMAIN || "dev-example.com";
  const certDir = path.resolve(__dirname, "../certs");
  const keyPath = path.join(certDir, `${subdomain}.${domain}-key.pem`);
  const certPath = path.join(certDir, `${subdomain}.${domain}.pem`);

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error(
      `SSL certificates not found. Run: mkcert ${subdomain}.${domain}`
    );
  }

  const ssl = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  https.createServer(ssl, app).listen(port, () => {
    console.log(
      `HTTPS Server running at https://${subdomain}.${domain}:${port}`
    );
  });
}

/**
 * Starts the server (HTTPS in dev, HTTP in staging/prod)
 */
export function startServer(app) {
  const port = process.env.PORT || 3000;
  const subdomain = "api"; // e.g., api.dev-example.com

  if (ENV_MODE_DEVELOPMENT) {
    startDevHttpsServer(app, port, subdomain);
  } else {
    app.listen(port, () => {
      console.log(`HTTP Server running on port ${port}`);
    });
  }
}
```

---

## Step 8: Main Server File

Create `server.js` or `index.js`:

```javascript
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { CORS_OPTIONS } from "./config/cors.js";
import { startServer } from "./config/server.js";
import { setCookie, resolveCookieDomain } from "./utils/cookies.js";

const app = express();

// Middleware
app.use(cors(CORS_OPTIONS));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Example: Login endpoint that sets cookies
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  // Your authentication logic here
  const user = await authenticateUser(email, password);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Set cookies with environment-appropriate settings
  setCookie(req, res, "access_token", accessToken, {
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  setCookie(req, res, "refresh_token", refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
});

// Example: Protected endpoint that reads cookies
app.get("/api/users/me", (req, res) => {
  const accessToken = req.cookies.access_token;

  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Verify token and return user data
  const user = verifyAccessToken(accessToken);

  if (!user) {
    return res.status(401).json({ error: "Invalid token" });
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
  });
});

// Example: Logout endpoint that clears cookies
app.post("/api/auth/logout", (req, res) => {
  const domain = resolveCookieDomain(req);

  res.clearCookie("access_token", { domain, path: "/" });
  res.clearCookie("refresh_token", { domain, path: "/" });

  res.json({ success: true });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
startServer(app);
```

---

## Step 9: Directory Structure

Your API project should look like this:

```
my-api/
├── certs/
│   ├── api.dev-example.com.pem
│   └── api.dev-example.com-key.pem
├── config/
│   ├── cors.js
│   └── server.js
├── utils/
│   └── cookies.js
├── .env
├── .gitignore
├── server.js
└── package.json
```

---

## Step 10: Update .gitignore

```bash
# .gitignore
node_modules/
certs/
.env
```

---

## Step 11: Run Your API

```bash
# Development mode
NODE_ENV=development node server.js

# Staging mode
NODE_ENV=staging node server.js

# Production mode
NODE_ENV=production node server.js
```

---

## Complete Working Example

### package.json

```json
{
  "name": "my-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "NODE_ENV=development node server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.3.1"
  }
}
```

### .env

```bash
NODE_ENV=development
PORT=3000
DEV_DOMAIN=dev-example.com
STAG_DOMAIN=example.dev
PROD_DOMAIN=example.com
```

### Test the Setup

1. **Start your API:**

   ```bash
   npm run dev
   ```

2. **Start your Svelte app with proxy:**

   ```bash
   npm run dev
   ```

3. **Test CORS and cookies:**

   ```bash
   # From your Svelte app (https://app.dev-example.com:8443)
   const response = await api.post("/auth/login", {
     email: "test@example.com",
     password: "password123"
   });

   # Check browser DevTools > Application > Cookies
   # You should see cookies set for .dev-example.com domain
   ```

---

## How It Works Together

### Development Flow

1. **Browser** → `https://app.dev-example.com:8443/api/login`
2. **svelte-api-proxy** adds `x-app-environment: local` header
3. **svelte-api-proxy** forwards to `https://api.dev-example.com:3000/api/login`
4. **API** receives request with `x-app-environment: local`
5. **API** sets cookies with `domain=.dev-example.com` and `secure=false`
6. **Browser** stores cookies for `.dev-example.com`
7. Cookies are now shared across all `*.dev-example.com` subdomains

### Staging Flow (Developer hitting staging API from local)

1. **Svelte app** `package.json` has `apiLocal: false` and `apiBaseUrl: "https://api.example.dev"`
2. **Browser** → `https://app.dev-example.com:8443/api/login`
3. **svelte-api-proxy** adds `x-app-environment: local` header
4. **svelte-api-proxy** forwards to `https://api.example.dev/api/login`
5. **Staging API** sees `x-app-environment: local`
6. **Staging API** sets cookies with `domain=.dev-example.com` (not `.example.dev`)
7. Developer can test against staging API with local domain cookies

### Production Flow

No proxy involved:

1. **Browser** → `https://app.example.com/api/login`
2. **API** at `https://api.example.com/api/login` responds
3. **API** sets cookies with `domain=.example.com` and `secure=true`

---

## Key Points

### DO

- Use leading dot in cookie domain: `.dev-example.com` (shares across subdomains)
- Check `x-app-environment: local` header to detect svelte-api-proxy requests
- Set `credentials: true` in CORS options
- Set `withCredentials: true` in your API client (axios, fetch)
- Use HTTPS in development with mkcert certificates
- Add dev URLs to CORS allowedOrigins in staging mode

### ❌ DON'T

- Don't use `localhost` or `127.0.0.1` in cookie domain (won't work across subdomains)
- Don't forget the leading dot in cookie domain
- Don't set `secure: true` for local development (won't work with self-signed certs)
- Don't commit SSL certificates to version control
- Don't use the same PORT for API and Svelte proxy

---

## Troubleshooting

### Cookies not being set

**Cause:** CORS `credentials: true` not set, or API client missing `withCredentials: true`

**Solution:**

```javascript
// API
export const CORS_OPTIONS = {
  origin: ...,
  credentials: true, // Required
};

// Svelte app
export const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // Required
});
```

### Cookies not shared across subdomains

**Cause:** Cookie domain doesn't have leading dot or doesn't match parent domain

**Solution:**

```javascript
// ❌ Wrong
res.cookie("token", value, { domain: "dev-example.com" });

// Correct
res.cookie("token", value, { domain: ".dev-example.com" });
```

### CORS errors in staging when using local proxy

**Cause:** Staging API doesn't allow dev domain origins

**Solution:** In staging mode, include dev URLs in allowed origins:

```javascript
if (ENV_MODE_STAGING) {
  return [...Object.values(STAG_URLS), ...Object.values(DEV_URLS)];
}
```

### SSL certificate errors

**Cause:** Certificates not generated or mkcert not installed

**Solution:**

```bash
mkcert -install
cd certs
mkcert api.dev-example.com
```

---

## Summary

You now have:

- HTTPS API server in development
- CORS configured for cross-origin requests
- Cookie sharing across subdomains
- Environment-aware cookie configuration
- Support for local development hitting staging API

Your API is now fully configured to work with svelte-api-proxy!
