import { z } from "zod";

export const GeneratorType = z.enum(["typedoc", "pydoc", "cli"]);
export type GeneratorType = z.infer<typeof GeneratorType>;

export const SDKConfigSchema = z.object({
  displayName: z.string(),
  icon: z.string(),
  order: z.number(),
  repo: z.string().url(),
  tagPattern: z.string(),
  tagFormat: z.string(),
  generator: GeneratorType,
  required: z.boolean(),
  minVersion: z.string().optional(),
  sdkPath: z.string().optional(),
  sdkPaths: z.array(z.string()).optional(),
  fallbackPackages: z.array(z.string()).optional().describe('Used if auto-discovery fails'),
  submodules: z.record(z.string(), z.array(z.string())).optional(),
  basePackage: z.string().optional().describe('Base Python package name for discovery'),
});
export type SDKConfig = z.infer<typeof SDKConfigSchema>;

export const ConfigFileSchema = z.object({
  sdks: z.record(z.string(), SDKConfigSchema),
});
export type ConfigFile = z.infer<typeof ConfigFileSchema>;

export interface GenerationContext {
  tempDir: string;
  docsDir: string;
  configsDir: string;
  limit?: number;
  force?: boolean;
}

export interface GenerationResult {
  generated: number;
  failed: number;
  failedVersions: string[];
}

export interface NavigationVersion {
  version: string;
  default: boolean;
  pages: string[];
}

export interface NavigationDropdown {
  dropdown: string;
  icon: string;
  versions: NavigationVersion[];
}

export interface NavigationDropdownWithOrder extends NavigationDropdown {
  _order: number;
}
