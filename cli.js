#!/usr/bin/env node

import { DevProxy } from "./index.js";

/**
 * Read configuration from environment variables
 * Expects PROXY_* prefixed environment variables
 * The consuming package should load dotenv before running this CLI
 */
const loadConfig = () => {
  const PROXY_API_LOCAL = process.env.PROXY_API_LOCAL;
  const PROXY_API_BASE_URL = process.env.PROXY_API_BASE_URL;

  if (!PROXY_API_LOCAL) {
    throw new Error("Missing required environment variable: PROXY_API_LOCAL");
  }

  if (!PROXY_API_BASE_URL) {
    throw new Error(
      "Missing required environment variable: PROXY_API_BASE_URL"
    );
  }

  const API_LOCAL = process.env[PROXY_API_LOCAL];
  const API_BASE_URL = process.env[PROXY_API_BASE_URL];

  if (API_LOCAL === undefined) {
    throw new Error(`Environment variable ${PROXY_API_LOCAL} is not defined`);
  }

  if (API_BASE_URL === undefined) {
    throw new Error(
      `Environment variable ${PROXY_API_BASE_URL} is not defined`
    );
  }

  return {
    appPort: process.env.PROXY_APP_PORT
      ? parseInt(process.env.PROXY_APP_PORT, 10)
      : undefined,
    proxyPort: process.env.PROXY_PORT
      ? parseInt(process.env.PROXY_PORT, 10)
      : undefined,
    devDomain: process.env.PROXY_DEV_DOMAIN,
    apiLocal: API_LOCAL === "true",
    apiBaseUrl: API_BASE_URL,
    certsPath: process.env.PROXY_CERTS_PATH,
    showLogs: process.env.PROXY_SHOW_LOGS !== "false",
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
