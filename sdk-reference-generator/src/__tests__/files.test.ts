import { describe, it, expect } from "vitest";
import { toTitleCase, extractTitle } from "../lib/files.js";

describe("toTitleCase", () => {
  it("converts snake_case to Title Case", () => {
    expect(toTitleCase("sandbox_sync")).toBe("Sandbox Sync");
    expect(toTitleCase("sandbox_async")).toBe("Sandbox Async");
    expect(toTitleCase("template_async")).toBe("Template Async");
  });

  it("capitalizes single words", () => {
    expect(toTitleCase("sandbox")).toBe("Sandbox");
    expect(toTitleCase("exceptions")).toBe("Exceptions");
  });

  it("handles already capitalized words", () => {
    expect(toTitleCase("Sandbox")).toBe("Sandbox");
    expect(toTitleCase("SANDBOX")).toBe("SANDBOX");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });

  it("handles multiple underscores", () => {
    expect(toTitleCase("a_b_c")).toBe("A B C");
  });
});

describe("extractTitle", () => {
  it("strips directory prefix from flattened filenames", () => {
    expect(extractTitle("modules-Sandbox")).toBe("Sandbox");
    expect(extractTitle("classes-MyClass")).toBe("MyClass");
    expect(extractTitle("interfaces-IUser")).toBe("IUser");
    expect(extractTitle("types-CustomType")).toBe("CustomType");
  });

  it("handles nested directory prefixes", () => {
    expect(extractTitle("modules-sandbox-Sandbox")).toBe("Sandbox");
    expect(extractTitle("classes-internal-MyClass")).toBe("MyClass");
  });

  it("handles snake_case after prefix removal", () => {
    expect(extractTitle("modules-sandbox_sync")).toBe("Sandbox Sync");
    expect(extractTitle("classes-my_class")).toBe("My Class");
  });

  it("handles files without directory prefix", () => {
    expect(extractTitle("Sandbox")).toBe("Sandbox");
    expect(extractTitle("sandbox_sync")).toBe("Sandbox Sync");
  });

  it("handles empty string", () => {
    expect(extractTitle("")).toBe("");
  });

  it("handles edge cases correctly", () => {
    // files with hyphenated prefixes get the prefix stripped
    expect(extractTitle("some-file")).toBe("File");
    // files without hyphens are processed as-is
    expect(extractTitle("MyClass")).toBe("MyClass");
    expect(extractTitle("simple")).toBe("Simple");
  });
});
