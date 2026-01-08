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

type TypedocSDKConfig = BaseSDKConfig & {
  generator: "typedoc";
};

type PydocSDKConfig = BaseSDKConfig & {
  generator: "pydoc";
  basePackage: string;
  fallbackPackages?: readonly string[];
  submodules?: Record<string, readonly string[]>;
};

type CLISDKConfig = BaseSDKConfig & {
  generator: "cli";
};

export type SDKConfig = TypedocSDKConfig | PydocSDKConfig | CLISDKConfig;
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
