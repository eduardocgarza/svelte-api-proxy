#!/usr/bin/env node

import { DevProxy } from "./index.js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Read configuration from the user's package.json
 */
const loadConfig = () => {
  try {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    if (!packageJson.proxyConfig) {
      throw new Error(
        "proxyConfig not found in package.json. Please add a 'proxyConfig' section to your package.json."
      );
    }

    return packageJson.proxyConfig;
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("package.json not found in current directory");
    }
    throw error;
  }
};

try {
  const config = loadConfig();
  const proxy = new DevProxy(config);
  proxy.start();
} catch (error) {
  console.error("[PROXY] Failed to start:", error.message);
  process.exit(1);
}
