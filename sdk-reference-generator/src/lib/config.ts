import fs from 'fs-extra';
import path from 'path';
import { ConfigFileSchema, type SDKConfig, type ConfigFile } from '../types.js';

let cachedConfig: ConfigFile | null = null;
let configPath: string = '';

export function initConfig(scriptDir: string): void {
  configPath = path.join(scriptDir, 'sdks.json');
  cachedConfig = null;
}

export async function loadConfig(): Promise<ConfigFile> {
  if (cachedConfig) return cachedConfig;

  const raw = await fs.readJSON(configPath);
  cachedConfig = ConfigFileSchema.parse(raw);
  return cachedConfig;
}

export async function getSDKConfig(sdkKey: string): Promise<SDKConfig | null> {
  const config = await loadConfig();
  return config.sdks[sdkKey] || null;
}

export async function getAllSDKKeys(): Promise<string[]> {
  const config = await loadConfig();
  return Object.keys(config.sdks);
}

