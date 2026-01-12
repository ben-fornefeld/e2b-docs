import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import type { SDKConfig, GenerationResult } from "../types.js";
import { handleGenerationFailures } from "../generator.js";
import { CONSTANTS } from "../lib/constants.js";

describe("handleGenerationFailures", () => {
  // required SDK config
  const requiredConfig: SDKConfig = {
    displayName: "Required SDK",
    icon: "square-js",
    order: 1,
    repo: "https://github.com/test/repo.git",
    tagPattern: "test@",
    tagFormat: "test@{version}",
    generator: "typedoc",
    required: true,
  };

  // optional SDK config
  const optionalConfig: SDKConfig = {
    displayName: "Optional SDK",
    icon: "python",
    order: 2,
    repo: "https://github.com/test/repo.git",
    tagPattern: "@test/python@",
    tagFormat: "@test/python@{version}",
    generator: "typedoc",
    required: false,
  };

  describe("required SDK", () => {
    it("throws error when any version fails", () => {
      const result: GenerationResult = {
        generated: 5,
        failed: 1,
        failedVersions: ["v1.0.0"],
      };

      expect(() => handleGenerationFailures(requiredConfig, result)).toThrow(
        "Generation aborted: Required SDK has failures"
      );
    });

    it("throws error when all versions fail", () => {
      const result: GenerationResult = {
        generated: 0,
        failed: 3,
        failedVersions: ["v1.0.0", "v2.0.0", "v3.0.0"],
      };

      expect(() => handleGenerationFailures(requiredConfig, result)).toThrow(
        "Generation aborted: Required SDK has failures"
      );
    });

    it("does not throw when no failures", () => {
      const result: GenerationResult = {
        generated: 3,
        failed: 0,
        failedVersions: [],
      };

      expect(() =>
        handleGenerationFailures(requiredConfig, result)
      ).not.toThrow();
    });
  });

  describe("optional SDK", () => {
    it("throws error when all versions fail (generated === 0)", () => {
      const result: GenerationResult = {
        generated: 0,
        failed: 3,
        failedVersions: ["v1.0.0", "v2.0.0", "v3.0.0"],
      };

      expect(() => handleGenerationFailures(optionalConfig, result)).toThrow(
        "Generation aborted: All versions failed"
      );
    });

    it("does not throw when partial success (some generated)", () => {
      const result: GenerationResult = {
        generated: 2,
        failed: 1,
        failedVersions: ["v1.0.0"],
      };

      expect(() =>
        handleGenerationFailures(optionalConfig, result)
      ).not.toThrow();
    });

    it("does not throw when no failures", () => {
      const result: GenerationResult = {
        generated: 3,
        failed: 0,
        failedVersions: [],
      };

      expect(() =>
        handleGenerationFailures(optionalConfig, result)
      ).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("does not throw for zero generated and zero failed", () => {
      const result: GenerationResult = {
        generated: 0,
        failed: 0,
        failedVersions: [],
      };

      // no failures means nothing to abort
      expect(() =>
        handleGenerationFailures(optionalConfig, result)
      ).not.toThrow();
      expect(() =>
        handleGenerationFailures(requiredConfig, result)
      ).not.toThrow();
    });
  });
});

describe("version discovery integration", () => {
  let tempDir: string;

  // mock the config and git modules
  vi.mock("../../sdks.config.js", () => ({
    default: {
      "test-sdk": {
        displayName: "Test SDK",
        icon: "square-js",
        order: 1,
        repo: "https://github.com/test/repo.git",
        tagPattern: "test@",
        tagFormat: "test@{version}",
        generator: "typedoc",
        required: true,
        minVersion: "1.0.0",
      },
      "optional-sdk": {
        displayName: "Optional SDK",
        icon: "python",
        order: 2,
        repo: "https://github.com/test/optional.git",
        tagPattern: "@optional@",
        tagFormat: "@optional@{version}",
        generator: "typedoc",
        required: false,
      },
    },
  }));

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gen-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.restoreAllMocks();
  });

  describe("generateSDK with unknown SDK", () => {
    it("returns failure result for unknown SDK key", async () => {
      const { generateSDK } = await import("../generator.js");

      const result = await generateSDK("unknown-sdk", "v1.0.0", {
        tempDir,
        docsDir: tempDir,
        configsDir: tempDir,
      });

      expect(result.generated).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failedVersions).toContain("unknown-sdk");
    });
  });
});

describe("versionExists", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "version-exists-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("returns true for existing version with mdx files", async () => {
    const { versionExists } = await import("../lib/versions.js");

    const versionDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk",
      "v1.0.0"
    );
    await fs.ensureDir(versionDir);
    await fs.writeFile(path.join(versionDir, "Test.mdx"), "# Content");

    const result = await versionExists("test-sdk", "v1.0.0", tempDir);

    expect(result).toBe(true);
  });

  it("returns true for version without v prefix", async () => {
    const { versionExists } = await import("../lib/versions.js");

    // create directory without "v" prefix
    const versionDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk",
      "1.0.0"
    );
    await fs.ensureDir(versionDir);
    await fs.writeFile(path.join(versionDir, "Test.mdx"), "# Content");

    // query with "v" prefix
    const result = await versionExists("test-sdk", "v1.0.0", tempDir);

    expect(result).toBe(true);
  });

  it("returns false for non-existing version", async () => {
    const { versionExists } = await import("../lib/versions.js");

    const result = await versionExists("test-sdk", "v99.0.0", tempDir);

    expect(result).toBe(false);
  });

  it("returns false for version directory without mdx files", async () => {
    const { versionExists } = await import("../lib/versions.js");

    const versionDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk",
      "v1.0.0"
    );
    await fs.ensureDir(versionDir);
    // no mdx files, only other files
    await fs.writeFile(path.join(versionDir, "readme.txt"), "text");

    const result = await versionExists("test-sdk", "v1.0.0", tempDir);

    expect(result).toBe(false);
  });
});

describe("fetchLocalVersions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-versions-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("returns empty array when SDK directory does not exist", async () => {
    const { fetchLocalVersions } = await import("../lib/versions.js");

    const result = await fetchLocalVersions("nonexistent-sdk", tempDir);

    expect(result).toEqual([]);
  });

  it("returns versions sorted descending", async () => {
    const { fetchLocalVersions } = await import("../lib/versions.js");

    const sdkDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk"
    );

    // create versions in random order
    for (const version of ["v1.0.0", "v2.0.0", "v1.5.0"]) {
      const versionDir = path.join(sdkDir, version);
      await fs.ensureDir(versionDir);
      await fs.writeFile(path.join(versionDir, "Test.mdx"), "# Content");
    }

    const result = await fetchLocalVersions("test-sdk", tempDir);

    expect(result).toEqual(["v2.0.0", "v1.5.0", "v1.0.0"]);
  });

  it("normalizes versions without v prefix", async () => {
    const { fetchLocalVersions } = await import("../lib/versions.js");

    const sdkDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk"
    );

    // create version without "v" prefix
    const versionDir = path.join(sdkDir, "1.0.0");
    await fs.ensureDir(versionDir);
    await fs.writeFile(path.join(versionDir, "Test.mdx"), "# Content");

    const result = await fetchLocalVersions("test-sdk", tempDir);

    expect(result).toEqual(["v1.0.0"]);
  });

  it("ignores non-version directories", async () => {
    const { fetchLocalVersions } = await import("../lib/versions.js");

    const sdkDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk"
    );

    // valid version
    const validDir = path.join(sdkDir, "v1.0.0");
    await fs.ensureDir(validDir);
    await fs.writeFile(path.join(validDir, "Test.mdx"), "# Content");

    // invalid versions
    await fs.ensureDir(path.join(sdkDir, "main"));
    await fs.writeFile(path.join(sdkDir, "main", "Test.mdx"), "# Content");
    await fs.ensureDir(path.join(sdkDir, "latest"));

    const result = await fetchLocalVersions("test-sdk", tempDir);

    expect(result).toEqual(["v1.0.0"]);
  });

  it("ignores version directories without mdx files", async () => {
    const { fetchLocalVersions } = await import("../lib/versions.js");

    const sdkDir = path.join(
      tempDir,
      CONSTANTS.DOCS_SDK_REF_PATH,
      "test-sdk"
    );

    // version with mdx files
    const withMdx = path.join(sdkDir, "v2.0.0");
    await fs.ensureDir(withMdx);
    await fs.writeFile(path.join(withMdx, "Test.mdx"), "# Content");

    // version without mdx files
    const withoutMdx = path.join(sdkDir, "v1.0.0");
    await fs.ensureDir(withoutMdx);
    await fs.writeFile(path.join(withoutMdx, "readme.txt"), "text");

    const result = await fetchLocalVersions("test-sdk", tempDir);

    expect(result).toEqual(["v2.0.0"]);
  });
});

