#!/usr/bin/env node

import { DevProxy } from "./index.js";

/**
 * Read configuration from environment variables
 * Expects PROXY_* prefixed environment variables
 * The consuming package should load dotenv before running this CLI
 */
const loadConfig = () => {
  return {
    appPort: process.env.PROXY_APP_PORT
      ? parseInt(process.env.PROXY_APP_PORT, 10)
      : undefined,
    proxyPort: process.env.PROXY_PORT
      ? parseInt(process.env.PROXY_PORT, 10)
      : undefined,
    devDomain: process.env.PROXY_DEV_DOMAIN,
    apiLocal: process.env.PROXY_API_LOCAL === "true",
    apiBaseUrl: process.env.PROXY_API_BASE_URL,
    certsPath: process.env.PROXY_CERTS_PATH,
    showLogs: process.env.PROXY_SHOW_LOGS !== "false", // defaults to true
  };
};

try {
  const config = loadConfig();
  const proxy = new DevProxy(config);
  proxy.start();
} catch (error) {
  console.error("[PROXY] Failed to start:", error.message);
  process.exit(1);
}
