type BaseSDKConfig = {
  displayName: string;
  icon: string;
  order: number;
  repo: string;
  tagPattern: string;
  tagFormat: string;
  required: boolean;
  minVersion?: string;
  sdkPath?: string;
  sdkPaths?: string[];
};

// generator-specific config shapes
export type TypedocConfig = {
  entryPoints: string[];
  exclude?: string[];
};

export type PydocConfig = {
  allowedPackages: readonly string[];
};

// discriminated union - defaultConfig and configOverrides typed by generator
type TypedocSDKConfig = BaseSDKConfig & {
  generator: "typedoc";
  defaultConfig: TypedocConfig;
  configOverrides?: Record<string, Partial<TypedocConfig>>;
};

type PydocSDKConfig = BaseSDKConfig & {
  generator: "pydoc";
  defaultConfig: PydocConfig;
  configOverrides?: Record<string, Partial<PydocConfig>>;
};

type CLISDKConfig = BaseSDKConfig & {
  generator: "cli";
  // no defaultConfig/configOverrides - CLI is self-contained
};

export type SDKConfig = TypedocSDKConfig | PydocSDKConfig | CLISDKConfig;
export type { TypedocSDKConfig, PydocSDKConfig, CLISDKConfig };
export type GeneratorType = SDKConfig["generator"];

export type ConfigFile = {
  sdks: Record<string, SDKConfig>;
};

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

export interface InstallResult {
  usePoetryRun: boolean;
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
