import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { flattenMarkdown, copyToDocs, locateSDKDir } from "../lib/files.js";
import { CONSTANTS } from "../lib/constants.js";

describe("flattenMarkdown", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flatten-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe("removeUnwantedFiles", () => {
    it("removes README.md, index.md, and index.mdx", async () => {
      await fs.writeFile(path.join(tempDir, "README.md"), "# Readme");
      await fs.writeFile(path.join(tempDir, "index.md"), "# Index");
      await fs.writeFile(path.join(tempDir, "index.mdx"), "# Index MDX");
      await fs.writeFile(path.join(tempDir, "Sandbox.md"), "# Keep this");

      await flattenMarkdown(tempDir);

      expect(await fs.pathExists(path.join(tempDir, "README.md"))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir, "index.md"))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir, "index.mdx"))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir, "Sandbox.mdx"))).toBe(true);
    });
  });

  describe("flattenNestedFiles", () => {
    it("flattens nested md files to top level", async () => {
      const nestedDir = path.join(tempDir, "modules", "sandbox");
      await fs.ensureDir(nestedDir);
      await fs.writeFile(path.join(nestedDir, "Sandbox.md"), "# Sandbox");

      await flattenMarkdown(tempDir);

      // nested file should be flattened with path prefix
      expect(
        await fs.pathExists(
          path.join(tempDir, "modules-sandbox-Sandbox.mdx")
        )
      ).toBe(true);
      // original nested directory should be removed
      expect(await fs.pathExists(nestedDir)).toBe(false);
    });

    it("renames page.md to parent directory name", async () => {
      const nestedDir = path.join(tempDir, "sandbox");
      await fs.ensureDir(nestedDir);
      await fs.writeFile(path.join(nestedDir, "page.md"), "# Page content");

      await flattenMarkdown(tempDir);

      expect(await fs.pathExists(path.join(tempDir, "sandbox.mdx"))).toBe(true);
    });

    it("renames index.md in nested dirs to parent directory name", async () => {
      const nestedDir = path.join(tempDir, "filesystem");
      await fs.ensureDir(nestedDir);
      await fs.writeFile(
        path.join(nestedDir, "index.md"),
        "# Filesystem index"
      );

      await flattenMarkdown(tempDir);

      expect(await fs.pathExists(path.join(tempDir, "filesystem.mdx"))).toBe(
        true
      );
    });

    it("handles deeply nested files", async () => {
      const deepDir = path.join(tempDir, "a", "b", "c");
      await fs.ensureDir(deepDir);
      await fs.writeFile(path.join(deepDir, "Deep.md"), "# Deep file");

      await flattenMarkdown(tempDir);

      expect(await fs.pathExists(path.join(tempDir, "a-b-c-Deep.mdx"))).toBe(
        true
      );
    });
  });

  describe("convertMdToMdx", () => {
    it("converts .md files to .mdx with frontmatter", async () => {
      await fs.writeFile(path.join(tempDir, "Test.md"), "# Test content");

      await flattenMarkdown(tempDir);

      const mdxPath = path.join(tempDir, "Test.mdx");
      expect(await fs.pathExists(mdxPath)).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, "Test.md"))).toBe(false);

      const content = await fs.readFile(mdxPath, "utf-8");
      expect(content).toContain("---");
      expect(content).toContain('sidebarTitle: "Test"');
      expect(content).toContain("# Test content");
    });

    it("generates correct title from snake_case filenames", async () => {
      await fs.writeFile(
        path.join(tempDir, "sandbox_sync.md"),
        "# Content"
      );

      await flattenMarkdown(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, "sandbox_sync.mdx"),
        "utf-8"
      );
      expect(content).toContain('sidebarTitle: "Sandbox Sync"');
    });
  });

  describe("ensureFrontmatter", () => {
    it("adds frontmatter to mdx files without it", async () => {
      // create mdx file without frontmatter
      await fs.writeFile(
        path.join(tempDir, "NeedsFrontmatter.mdx"),
        "# No frontmatter"
      );

      await flattenMarkdown(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, "NeedsFrontmatter.mdx"),
        "utf-8"
      );
      expect(content.startsWith("---")).toBe(true);
      expect(content).toContain('sidebarTitle: "NeedsFrontmatter"');
    });

    it("does not duplicate frontmatter if already present", async () => {
      const existingFrontmatter = `---
sidebarTitle: "Existing"
---

# Content`;
      await fs.writeFile(
        path.join(tempDir, "HasFrontmatter.mdx"),
        existingFrontmatter
      );

      await flattenMarkdown(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, "HasFrontmatter.mdx"),
        "utf-8"
      );
      // should still have exactly one frontmatter block
      const frontmatterCount = (content.match(/---/g) || []).length;
      expect(frontmatterCount).toBe(2); // opening and closing ---
      expect(content).toContain('sidebarTitle: "Existing"');
    });
  });

  describe("full workflow", () => {
    it("processes complex directory structure correctly", async () => {
      // create complex structure
      await fs.writeFile(path.join(tempDir, "README.md"), "# Remove me");
      await fs.writeFile(path.join(tempDir, "TopLevel.md"), "# Top level");

      const modulesDir = path.join(tempDir, "modules");
      await fs.ensureDir(modulesDir);
      await fs.writeFile(path.join(modulesDir, "page.md"), "# Modules page");
      await fs.writeFile(path.join(modulesDir, "Helper.md"), "# Helper");

      const sandboxDir = path.join(modulesDir, "sandbox");
      await fs.ensureDir(sandboxDir);
      await fs.writeFile(path.join(sandboxDir, "Sandbox.md"), "# Sandbox class");

      await flattenMarkdown(tempDir);

      // check results
      expect(await fs.pathExists(path.join(tempDir, "README.md"))).toBe(false);
      expect(await fs.pathExists(path.join(tempDir, "TopLevel.mdx"))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, "modules.mdx"))).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, "modules-Helper.mdx"))).toBe(
        true
      );
      expect(
        await fs.pathExists(path.join(tempDir, "modules-sandbox-Sandbox.mdx"))
      ).toBe(true);

      // verify all have frontmatter
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        if (file.endsWith(".mdx")) {
          const content = await fs.readFile(path.join(tempDir, file), "utf-8");
          expect(content.startsWith("---")).toBe(true);
        }
      }

      // verify directories are removed
      expect(await fs.pathExists(modulesDir)).toBe(false);
    });
  });
});

describe("locateSDKDir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "locate-sdk-test-"));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it("returns sdkPath when it exists", async () => {
    const sdkDir = path.join(tempDir, "packages", "sdk");
    await fs.ensureDir(sdkDir);

    const result = await locateSDKDir(tempDir, "packages/sdk");

    expect(result).toBe(sdkDir);
  });

  it("returns null when sdkPath does not exist", async () => {
    const result = await locateSDKDir(tempDir, "nonexistent/path");

    expect(result).toBeNull();
  });

  it("returns first existing path from sdkPaths array", async () => {
    const secondPath = path.join(tempDir, "js");
    await fs.ensureDir(secondPath);

    const result = await locateSDKDir(tempDir, undefined, [
      "python",
      "js",
      "go",
    ]);

    expect(result).toBe(secondPath);
  });

  it("returns null when no sdkPaths exist", async () => {
    const result = await locateSDKDir(tempDir, undefined, [
      "nonexistent1",
      "nonexistent2",
    ]);

    expect(result).toBeNull();
  });

  it("returns repoDir when no paths specified", async () => {
    const result = await locateSDKDir(tempDir);

    expect(result).toBe(tempDir);
  });

  it("sdkPath takes priority over sdkPaths", async () => {
    const sdkPathDir = path.join(tempDir, "primary");
    const sdkPathsDir = path.join(tempDir, "fallback");
    await fs.ensureDir(sdkPathDir);
    await fs.ensureDir(sdkPathsDir);

    const result = await locateSDKDir(tempDir, "primary", ["fallback"]);

    expect(result).toBe(sdkPathDir);
  });
});

describe("copyToDocs", () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(async () => {
    srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "copy-src-"));
    destDir = await fs.mkdtemp(path.join(os.tmpdir(), "copy-dest-"));
  });

  afterEach(async () => {
    await fs.remove(srcDir);
    await fs.remove(destDir);
  });

  it("copies non-empty mdx files to destination", async () => {
    await fs.writeFile(
      path.join(srcDir, "Test.mdx"),
      '---\nsidebarTitle: "Test"\n---\n\n# Content'
    );
    await fs.writeFile(
      path.join(srcDir, "Another.mdx"),
      '---\nsidebarTitle: "Another"\n---\n\n# More'
    );

    const result = await copyToDocs(srcDir, destDir, "SDK", "v1.0.0");

    expect(result).toBe(true);
    expect(await fs.pathExists(path.join(destDir, "Test.mdx"))).toBe(true);
    expect(await fs.pathExists(path.join(destDir, "Another.mdx"))).toBe(true);
  });

  it("returns false when no mdx files exist", async () => {
    // srcDir is empty

    const result = await copyToDocs(srcDir, destDir, "SDK", "v1.0.0");

    expect(result).toBe(false);
  });

  it("skips empty mdx files", async () => {
    await fs.writeFile(path.join(srcDir, "Empty.mdx"), "");
    await fs.writeFile(
      path.join(srcDir, "Valid.mdx"),
      '---\nsidebarTitle: "Valid"\n---\n\n# Content'
    );

    const result = await copyToDocs(srcDir, destDir, "SDK", "v1.0.0");

    expect(result).toBe(true);
    expect(await fs.pathExists(path.join(destDir, "Valid.mdx"))).toBe(true);
    expect(await fs.pathExists(path.join(destDir, "Empty.mdx"))).toBe(false);
  });

  it("returns false when only empty mdx files exist", async () => {
    await fs.writeFile(path.join(srcDir, "Empty1.mdx"), "");
    await fs.writeFile(path.join(srcDir, "Empty2.mdx"), "");

    const result = await copyToDocs(srcDir, destDir, "SDK", "v1.0.0");

    expect(result).toBe(false);
  });

  it("creates destination directory if it does not exist", async () => {
    const newDest = path.join(destDir, "nested", "path");
    await fs.writeFile(
      path.join(srcDir, "Test.mdx"),
      '---\nsidebarTitle: "Test"\n---\n\n# Content'
    );

    const result = await copyToDocs(srcDir, newDest, "SDK", "v1.0.0");

    expect(result).toBe(true);
    expect(await fs.pathExists(newDest)).toBe(true);
    expect(await fs.pathExists(path.join(newDest, "Test.mdx"))).toBe(true);
  });

  it("ignores non-mdx files", async () => {
    await fs.writeFile(path.join(srcDir, "readme.txt"), "text file");
    await fs.writeFile(path.join(srcDir, "config.json"), "{}");
    await fs.writeFile(
      path.join(srcDir, "Valid.mdx"),
      '---\nsidebarTitle: "Valid"\n---\n\n# Content'
    );

    const result = await copyToDocs(srcDir, destDir, "SDK", "v1.0.0");

    expect(result).toBe(true);
    expect(await fs.pathExists(path.join(destDir, "Valid.mdx"))).toBe(true);
    expect(await fs.pathExists(path.join(destDir, "readme.txt"))).toBe(false);
    expect(await fs.pathExists(path.join(destDir, "config.json"))).toBe(false);
  });
});

