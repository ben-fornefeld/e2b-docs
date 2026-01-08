import sdks from "../../sdks.config.js";
import type { SDKConfig, ConfigFile } from "../types.js";

export function getConfig(): ConfigFile {
  return { sdks };
}

export function getSDKConfig(sdkKey: string): SDKConfig | null {
  const config = getConfig();
  return config.sdks[sdkKey] || null;
}

export function getAllSDKKeys(): string[] {
  const config = getConfig();
  return Object.keys(config.sdks);
}
