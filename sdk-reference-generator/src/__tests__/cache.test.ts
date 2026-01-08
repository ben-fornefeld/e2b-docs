import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs-extra";
import { hashLockfile } from "../lib/cache.js";

// mock fs-extra
vi.mock("fs-extra");

describe("hashLockfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds lockfile in current directory", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    const mockReadFile = vi.mocked(fs.readFile);

    mockPathExists.mockImplementation((p: string) => {
      return Promise.resolve(p === path.join("/test/dir", "pnpm-lock.yaml"));
    });

    mockReadFile.mockImplementation(() => {
      return Promise.resolve(Buffer.from("lockfile content"));
    });

    const result = await hashLockfile("/test/dir", "typedoc");

    expect(result).not.toBeNull();
    expect(result).toHaveLength(32);
    expect(mockPathExists).toHaveBeenCalledWith(
      path.join("/test/dir", "pnpm-lock.yaml")
    );
  });

  it("finds lockfile in parent directory", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    const mockReadFile = vi.mocked(fs.readFile);

    mockPathExists.mockImplementation((p: string) => {
      return Promise.resolve(p === path.join("/test", "pnpm-lock.yaml"));
    });

    mockReadFile.mockImplementation(() => {
      return Promise.resolve(Buffer.from("parent lockfile"));
    });

    const result = await hashLockfile("/test/dir/subdir", "typedoc");

    expect(result).not.toBeNull();
  });

  it("stops at filesystem root without infinite loop (Unix)", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    mockPathExists.mockImplementation(() => Promise.resolve(false));

    const result = await hashLockfile("/deep/nested/dir", "typedoc");

    expect(result).toBeNull();
    expect(mockPathExists.mock.calls.length).toBeLessThan(20);
  });

  it("stops at filesystem root without infinite loop (Windows-style path)", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    mockPathExists.mockImplementation(() => Promise.resolve(false));

    const result = await hashLockfile("C:\\deep\\nested\\dir", "typedoc");

    expect(result).toBeNull();
    expect(mockPathExists.mock.calls.length).toBeLessThan(20);
  });

  it("returns null when no lockfile found", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    mockPathExists.mockImplementation(() => Promise.resolve(false));

    const result = await hashLockfile("/test/dir", "typedoc");

    expect(result).toBeNull();
  });

  it("tries multiple lockfile patterns in order", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    const mockReadFile = vi.mocked(fs.readFile);

    mockPathExists.mockImplementation((p: string) => {
      return Promise.resolve(p.includes("package-lock.json"));
    });

    mockReadFile.mockImplementation(() => {
      return Promise.resolve(Buffer.from("npm lockfile"));
    });

    const result = await hashLockfile("/test/dir", "typedoc");

    expect(result).not.toBeNull();
    expect(mockPathExists).toHaveBeenCalledWith(
      path.join("/test/dir", "pnpm-lock.yaml")
    );
    expect(mockPathExists).toHaveBeenCalledWith(
      path.join("/test/dir", "package-lock.json")
    );
  });

  it("handles pydoc generator with poetry.lock", async () => {
    const mockPathExists = vi.mocked(fs.pathExists);
    const mockReadFile = vi.mocked(fs.readFile);

    mockPathExists.mockImplementation((p: string) => {
      return Promise.resolve(p.includes("poetry.lock"));
    });

    mockReadFile.mockImplementation(() => {
      return Promise.resolve(Buffer.from("poetry lockfile"));
    });

    const result = await hashLockfile("/test/python-project", "pydoc");

    expect(result).not.toBeNull();
    expect(mockPathExists).toHaveBeenCalledWith(
      path.join("/test/python-project", "poetry.lock")
    );
  });
});
