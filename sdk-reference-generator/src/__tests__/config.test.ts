import { describe, it, expect } from "vitest";
import { resolveConfig, buildTypedocConfig, TYPEDOC_FORMATTING } from "../lib/config.js";
import type { TypedocConfig, PydocConfig } from "../types.js";

describe("resolveConfig", () => {
  describe("with TypedocConfig", () => {
    const defaultConfig: TypedocConfig = {
      entryPoints: ["src/index.ts"],
    };

    it("returns defaultConfig when no overrides", () => {
      const result = resolveConfig(defaultConfig, undefined, "v1.0.0");
      expect(result).toEqual(defaultConfig);
    });

    it("returns defaultConfig when no matching range", () => {
      const overrides = {
        ">=2.0.0": { entryPoints: ["src/v2/index.ts"] },
      };
      const result = resolveConfig(defaultConfig, overrides, "v1.5.0");
      expect(result).toEqual(defaultConfig);
    });

    it("returns merged config when version matches range", () => {
      const overrides = {
        ">=1.0.0 <2.0.0": { entryPoints: ["src/v1/index.ts"] },
      };
      const result = resolveConfig(defaultConfig, overrides, "v1.5.0");
      expect(result).toEqual({ entryPoints: ["src/v1/index.ts"] });
    });

    it("handles version with v prefix", () => {
      const overrides = {
        ">=1.0.0": { entryPoints: ["src/new/index.ts"] },
      };
      const result = resolveConfig(defaultConfig, overrides, "v1.2.3");
      expect(result).toEqual({ entryPoints: ["src/new/index.ts"] });
    });

    it("handles version without v prefix", () => {
      const overrides = {
        ">=1.0.0": { entryPoints: ["src/new/index.ts"] },
      };
      const result = resolveConfig(defaultConfig, overrides, "1.2.3");
      expect(result).toEqual({ entryPoints: ["src/new/index.ts"] });
    });

    it("uses first matching range when multiple match", () => {
      const overrides = {
        ">=1.0.0 <1.5.0": { entryPoints: ["src/v1-early/index.ts"] },
        ">=1.0.0": { entryPoints: ["src/v1/index.ts"] },
      };
      const result = resolveConfig(defaultConfig, overrides, "v1.2.0");
      expect(result).toEqual({ entryPoints: ["src/v1-early/index.ts"] });
    });

    it("merges partial overrides with defaults", () => {
      const configWithExclude: TypedocConfig = {
        entryPoints: ["src/index.ts"],
        exclude: ["**/*.test.ts"],
      };
      const overrides = {
        ">=1.0.0": { entryPoints: ["src/new/index.ts"] },
      };
      const result = resolveConfig(configWithExclude, overrides, "v1.0.0");
      expect(result).toEqual({
        entryPoints: ["src/new/index.ts"],
        exclude: ["**/*.test.ts"],
      });
    });
  });

  describe("with PydocConfig", () => {
    const defaultConfig: PydocConfig = {
      allowedPackages: ["e2b"],
    };

    it("returns defaultConfig when no overrides", () => {
      const result = resolveConfig(defaultConfig, undefined, "v1.0.0");
      expect(result).toEqual(defaultConfig);
    });

    it("returns merged config when version matches range", () => {
      const overrides = {
        ">=1.0.0": { allowedPackages: ["e2b.sandbox_sync", "e2b.sandbox_async"] as const },
      };
      const result = resolveConfig(defaultConfig, overrides, "v1.5.0");
      expect(result.allowedPackages).toEqual(["e2b.sandbox_sync", "e2b.sandbox_async"]);
    });
  });

  describe("semver range matching", () => {
    const defaultConfig: TypedocConfig = { entryPoints: ["default.ts"] };

    it("matches exact version", () => {
      const overrides = { "1.0.0": { entryPoints: ["exact.ts"] } };
      const result = resolveConfig(defaultConfig, overrides, "v1.0.0");
      expect(result.entryPoints).toEqual(["exact.ts"]);
    });

    it("matches >= range", () => {
      const overrides = { ">=1.0.0": { entryPoints: ["gte.ts"] } };
      expect(resolveConfig(defaultConfig, overrides, "v1.0.0").entryPoints).toEqual(["gte.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v2.0.0").entryPoints).toEqual(["gte.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v0.9.0").entryPoints).toEqual(["default.ts"]);
    });

    it("matches < range", () => {
      const overrides = { "<2.0.0": { entryPoints: ["lt.ts"] } };
      expect(resolveConfig(defaultConfig, overrides, "v1.9.9").entryPoints).toEqual(["lt.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v2.0.0").entryPoints).toEqual(["default.ts"]);
    });

    it("matches compound range", () => {
      const overrides = { ">=1.0.0 <2.0.0": { entryPoints: ["compound.ts"] } };
      expect(resolveConfig(defaultConfig, overrides, "v1.0.0").entryPoints).toEqual(["compound.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v1.9.9").entryPoints).toEqual(["compound.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v0.9.9").entryPoints).toEqual(["default.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v2.0.0").entryPoints).toEqual(["default.ts"]);
    });

    it("matches tilde range", () => {
      const overrides = { "~1.2.0": { entryPoints: ["tilde.ts"] } };
      expect(resolveConfig(defaultConfig, overrides, "v1.2.0").entryPoints).toEqual(["tilde.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v1.2.9").entryPoints).toEqual(["tilde.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v1.3.0").entryPoints).toEqual(["default.ts"]);
    });

    it("matches caret range", () => {
      const overrides = { "^1.2.0": { entryPoints: ["caret.ts"] } };
      expect(resolveConfig(defaultConfig, overrides, "v1.2.0").entryPoints).toEqual(["caret.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v1.9.9").entryPoints).toEqual(["caret.ts"]);
      expect(resolveConfig(defaultConfig, overrides, "v2.0.0").entryPoints).toEqual(["default.ts"]);
    });
  });
});

describe("buildTypedocConfig", () => {
  it("merges TYPEDOC_FORMATTING with resolved config", () => {
    const resolved: TypedocConfig = {
      entryPoints: ["src/sandbox/index.ts"],
    };
    const result = buildTypedocConfig(resolved);

    expect(result.entryPoints).toEqual(["src/sandbox/index.ts"]);
    expect(result.out).toBe(TYPEDOC_FORMATTING.out);
    expect(result.excludeExternals).toBe(true);
    expect(result.hidePageTitle).toBe(true);
  });

  it("includes exclude when provided", () => {
    const resolved: TypedocConfig = {
      entryPoints: ["src/index.ts"],
      exclude: ["**/*.test.ts", "**/__tests__/**"],
    };
    const result = buildTypedocConfig(resolved);

    expect(result.exclude).toEqual(["**/*.test.ts", "**/__tests__/**"]);
  });

  it("does not include exclude when not provided", () => {
    const resolved: TypedocConfig = {
      entryPoints: ["src/index.ts"],
    };
    const result = buildTypedocConfig(resolved);

    // exclude comes from TYPEDOC_FORMATTING default
    expect(result.exclude).toEqual(TYPEDOC_FORMATTING.exclude);
  });
});

describe("TYPEDOC_FORMATTING", () => {
  it("has all required formatting options", () => {
    expect(TYPEDOC_FORMATTING.out).toBe("sdk_ref");
    expect(TYPEDOC_FORMATTING.excludeExternals).toBe(true);
    expect(TYPEDOC_FORMATTING.excludeInternal).toBe(true);
    expect(TYPEDOC_FORMATTING.excludePrivate).toBe(true);
    expect(TYPEDOC_FORMATTING.excludeProtected).toBe(true);
    expect(TYPEDOC_FORMATTING.outputFileStrategy).toBe("modules");
    expect(TYPEDOC_FORMATTING.readme).toBe("none");
    expect(TYPEDOC_FORMATTING.disableSources).toBe(true);
    expect(TYPEDOC_FORMATTING.classPropertiesFormat).toBe("table");
    expect(TYPEDOC_FORMATTING.hidePageTitle).toBe(true);
    expect(TYPEDOC_FORMATTING.hideBreadcrumbs).toBe(true);
  });
});

