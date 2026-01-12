import semver from "semver";
import { stripVersionPrefix } from "./utils.js";
import type { TypedocConfig, PydocConfig } from "../types.js";

// shared typedoc formatting settings (applied to all typedoc SDKs)
export const TYPEDOC_FORMATTING = {
  out: "sdk_ref",
  plugin: ["typedoc-plugin-markdown"],
  exclude: ["**/*.spec.ts"],
  excludeExternals: true,
  excludeInternal: true,
  excludePrivate: true,
  excludeProtected: true,
  navigation: {
    includeGroups: false,
    includeCategories: false,
  },
  outputFileStrategy: "modules",
  readme: "none",
  disableSources: true,
  classPropertiesFormat: "table",
  typeDeclarationFormat: "table",
  enumMembersFormat: "table",
  parametersFormat: "table",
  expandParameters: true,
  useCodeBlocks: true,
  hidePageTitle: true,
  hideBreadcrumbs: true,
} as const;

/**
 * Resolves config by matching version against semver ranges in configOverrides.
 * Returns merged defaultConfig with matching override, or defaultConfig if no match.
 */
export function resolveConfig<T extends TypedocConfig | PydocConfig>(
  defaultConfig: T,
  configOverrides: Record<string, Partial<T>> | undefined,
  version: string
): T {
  if (!configOverrides) return defaultConfig;

  const cleanVersion = stripVersionPrefix(version);

  for (const [range, override] of Object.entries(configOverrides)) {
    if (semver.satisfies(cleanVersion, range)) {
      return { ...defaultConfig, ...override } as T;
    }
  }

  return defaultConfig;
}

/**
 * Builds the full typedoc config by merging formatting defaults with SDK-specific settings.
 */
export function buildTypedocConfig(
  resolved: TypedocConfig
): Record<string, unknown> {
  return {
    ...TYPEDOC_FORMATTING,
    entryPoints: resolved.entryPoints,
    ...(resolved.exclude && { exclude: resolved.exclude }),
  };
}
