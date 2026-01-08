import sdks from "../../sdks.config.js";
import type { SDKConfig, ConfigFile } from "../types.js";

export async function getConfig(): Promise<ConfigFile> {
  return { sdks };
}

export async function getSDKConfig(sdkKey: string): Promise<SDKConfig | null> {
  const config = await getConfig();
  return config.sdks[sdkKey] || null;
}

export async function getAllSDKKeys(): Promise<string[]> {
  const config = await getConfig();
  return Object.keys(config.sdks);
}
