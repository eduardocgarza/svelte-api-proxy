import fs from "fs";
import path from "path";
import https from "https";
import httpProxy from "http-proxy";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ============================================================================
 * HTTPS DEVELOPMENT PROXY
 * ============================================================================
 * Creates an HTTPS proxy server for local development that routes requests
 * between a local Svelte/React app and either a local or remote API.
 */

export class DevProxy {
  constructor(config = {}) {
    this.config = this.validateConfig(config);
    this.appProxy = null;
    this.apiProxy = null;
    this.server = null;
  }

  /**
   * Validates and normalizes the configuration
   */
  validateConfig(config) {
    const required = [
      "appPort",
      "proxyPort",
      "devDomain",
      "apiBaseUrl",
      "certsPath",
    ];

    for (const key of required) {
      if (!config[key]) {
        throw new Error(`${key} is required`);
      }
    }

    return {
      appPort: config.appPort,
      proxyPort: config.proxyPort,
      devDomain: config.devDomain,
      apiLocal: config.apiLocal ?? false,
      apiBaseUrl: config.apiBaseUrl,
      certsPath: config.certsPath,
      showLogs: config.showLogs ?? true,
    };
  }

  /**
   * Load SSL certificates from the provided path
   */
  loadSSLCertificates() {
    const keyPath = path.join(
      this.config.certsPath,
      `${this.config.devDomain}-key.pem`
    );
    const certPath = path.join(
      this.config.certsPath,
      `${this.config.devDomain}.pem`
    );

    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL key not found at: ${keyPath}`);
    }

    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL certificate not found at: ${certPath}`);
    }

    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  /**
   * Create app proxy instance (for Svelte/Vite)
   */
  createAppProxy() {
    return httpProxy.createProxyServer({
      target: `http://localhost:${this.config.appPort}`,
      changeOrigin: true,
    });
  }

  /**
   * Create API proxy instance (for local or remote API)
   */
  createAPIProxy() {
    return httpProxy.createProxyServer({
      target: this.config.apiBaseUrl,
      changeOrigin: true,
      secure: !this.config.apiLocal,
    });
  }

  /**
   * Setup event handlers for API proxy
   */
  setupAPIProxyHandlers(proxy) {
    proxy.on("proxyReq", (proxyReq, req) => {
      Object.keys(req.headers).forEach((headerKey) => {
        /**
         * @note Skip the 'Host' header to prevent routing conflicts
         * The 'Host' header indicates which domain the request is intended for.
         * Forwarding the local dev host would cause the remote server to reject
         * the request since it's not configured to handle that domain.
         * The 'changeOrigin: true' option handles setting the correct Host.
         */
        if (headerKey.toLowerCase() !== "host") {
          proxyReq.setHeader(headerKey, req.headers[headerKey]);
        }
      });

      /**
       * @note Add environment identifier for staging requests
       * This allows the staging API to differentiate between requests
       * originating from local development vs production deployments.
       */
      if (!this.config.apiLocal) {
        proxyReq.setHeader("x-app-environment", "local");
      }

      if (this.config.showLogs) {
        console.log(
          `[PROXY] ${req.method} ${req.url} → ${this.config.apiBaseUrl}${req.url}`
        );
      }
    });

    proxy.on("proxyRes", (proxyRes, req, res) => {
      if (this.config.showLogs) {
        console.log(
          `[PROXY] Response: ${proxyRes.statusCode} ${req.method} ${req.url}`
        );
      }

      Object.keys(proxyRes.headers).forEach((headerKey) => {
        res.setHeader(headerKey, proxyRes.headers[headerKey]);
      });
    });

    proxy.on("error", (error, req, res) => {
      console.error("[PROXY] API proxy error:", error.message);
      if (res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("API proxy error");
      }
    });
  }

  /**
   * Setup event handlers for app proxy
   */
  setupAppProxyHandlers(proxy) {
    proxy.on("error", (err, req, resOrSocket, head) => {
      console.error("[PROXY] App proxy error:", err.message);
      if (err.code === "ECONNREFUSED") {
        // Handle connection refused gracefully (e.g., app not ready yet)
        console.warn("[PROXY] App not ready yet, ignoring...");
        if (resOrSocket.destroy) {
          resOrSocket.destroy(); // For WS socket
        }
        return;
      }
      if (resOrSocket && !resOrSocket.headersSent) {
        if (typeof resOrSocket.writeHead === "function") {
          // HTTP response
          resOrSocket.writeHead(500, { "Content-Type": "text/plain" });
          resOrSocket.end("App proxy error");
        } else {
          // WS socket
          resOrSocket.destroy();
        }
      }
    });
  }

  /**
   * @note SPA fallback handler for client-side routing
   * When a route doesn't match a static asset or API endpoint, serve the
   * root index.html to allow the SPA router to handle the route client-side.
   */
  handleSPAFallback(req, res) {
    const fallbackProxy = httpProxy.createProxyServer({
      target: `http://localhost:${this.config.appPort}`,
      changeOrigin: true,
    });
    req.url = "/";
    fallbackProxy.web(req, res);
  }

  /**
   * Route incoming requests
   */

  routeRequest(req, res) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    if (req.url.startsWith("/api/")) {
      this.apiProxy.web(req, res);
    } else {
      this.appProxy.web(req, res);
    }
  }

  /**
   * Start the HTTPS proxy server
   */
  start() {
    console.log("[PROXY] Starting HTTPS dev proxy...");
    console.log(
      `[PROXY] API target → ${this.config.apiLocal ? "LOCAL" : "REMOTE"} (${
        this.config.apiBaseUrl
      })`
    );

    const ssl = this.loadSSLCertificates();

    this.appProxy = this.createAppProxy();
    this.apiProxy = this.createAPIProxy();

    this.setupAppProxyHandlers(this.appProxy);
    this.setupAPIProxyHandlers(this.apiProxy);

    this.server = https.createServer(ssl, (req, res) =>
      this.routeRequest(req, res)
    );

    /**
     * @note WebSocket upgrade handling
     * Enables WebSocket connections for both API and app (HMR, live reload, etc.)
     */
    this.server.on("upgrade", (req, socket, head) => {
      if (req.url.startsWith("/api/")) {
        this.apiProxy.ws(req, socket, head);
      } else {
        this.appProxy.ws(req, socket, head);
      }
    });

    this.server.listen(this.config.proxyPort, () => {
      console.log(
        `[PROXY] HTTPS server → https://${this.config.devDomain}:${this.config.proxyPort}`
      );
      console.log(`[PROXY] App → http://localhost:${this.config.appPort}`);
      console.log(`[PROXY] API → ${this.config.apiBaseUrl}`);
    });
  }

  /**
   * Stop the proxy server
   */
  stop() {
    if (this.server) {
      this.server.close();
      console.log("[PROXY] Server stopped");
    }
  }
}

/**
 * CLI entry point when run directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];

    switch (key) {
      case "app-port":
        config.appPort = parseInt(value);
        break;
      case "proxy-port":
        config.proxyPort = parseInt(value);
        break;
      case "dev-domain":
        config.devDomain = value;
        break;
      case "api-local":
        config.apiLocal = value === "true";
        break;
      case "api-base-url":
        config.apiBaseUrl = value;
        break;
      case "certs-path":
        config.certsPath = value;
        break;
      case "show-logs":
        config.showLogs = value === "true";
        break;
    }
  }

  try {
    const proxy = new DevProxy(config);
    proxy.start();
  } catch (error) {
    console.error("[PROXY] Failed to start:", error.message);
    process.exit(1);
  }
}
