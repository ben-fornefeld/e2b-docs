import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckoutManager } from "../lib/checkout.js";

vi.mock("../lib/git.js", () => ({
  cloneAtTag: vi.fn(),
  checkoutTag: vi.fn(),
}));

vi.mock("fs-extra", () => ({
  default: {
    remove: vi.fn(),
  },
}));

import { cloneAtTag, checkoutTag } from "../lib/git.js";
import fs from "fs-extra";

const mockCloneAtTag = vi.mocked(cloneAtTag);
const mockCheckoutTag = vi.mocked(checkoutTag);
const mockRemove = vi.mocked(fs.remove);

describe("CheckoutManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrClone", () => {
    it("clones repo on first call", async () => {
      const mgr = new CheckoutManager();

      const repoDir = await mgr.getOrClone(
        "test-sdk",
        "https://github.com/test/repo.git",
        "v1.0.0",
        "/tmp"
      );

      expect(repoDir).toBe("/tmp/shared-test-sdk");
      expect(mockCloneAtTag).toHaveBeenCalledWith(
        "https://github.com/test/repo.git",
        "v1.0.0",
        "/tmp/shared-test-sdk"
      );
    });

    it("returns cached dir on subsequent calls", async () => {
      const mgr = new CheckoutManager();

      await mgr.getOrClone(
        "test-sdk",
        "https://github.com/test/repo.git",
        "v1.0.0",
        "/tmp"
      );

      mockCloneAtTag.mockClear();

      const repoDir = await mgr.getOrClone(
        "test-sdk",
        "https://github.com/test/repo.git",
        "v2.0.0",
        "/tmp"
      );

      expect(repoDir).toBe("/tmp/shared-test-sdk");
      expect(mockCloneAtTag).not.toHaveBeenCalled();
    });

    it("handles multiple SDKs independently", async () => {
      const mgr = new CheckoutManager();

      const dir1 = await mgr.getOrClone(
        "sdk-a",
        "https://github.com/test/a.git",
        "v1.0.0",
        "/tmp"
      );

      const dir2 = await mgr.getOrClone(
        "sdk-b",
        "https://github.com/test/b.git",
        "v2.0.0",
        "/tmp"
      );

      expect(dir1).toBe("/tmp/shared-sdk-a");
      expect(dir2).toBe("/tmp/shared-sdk-b");
      expect(mockCloneAtTag).toHaveBeenCalledTimes(2);
    });
  });

  describe("switchVersion", () => {
    it("switches to new tag in existing checkout", async () => {
      const mgr = new CheckoutManager();

      await mgr.getOrClone(
        "test-sdk",
        "https://github.com/test/repo.git",
        "v1.0.0",
        "/tmp"
      );

      await mgr.switchVersion("test-sdk", "v2.0.0");

      expect(mockCheckoutTag).toHaveBeenCalledWith(
        "/tmp/shared-test-sdk",
        "v2.0.0"
      );
    });

    it("throws if checkout not initialized", async () => {
      const mgr = new CheckoutManager();

      await expect(mgr.switchVersion("unknown-sdk", "v1.0.0")).rejects.toThrow(
        "Checkout not initialized for unknown-sdk"
      );
    });
  });

  describe("getRepoDir", () => {
    it("returns undefined for unknown SDK", () => {
      const mgr = new CheckoutManager();
      expect(mgr.getRepoDir("unknown")).toBeUndefined();
    });

    it("returns path for initialized SDK", async () => {
      const mgr = new CheckoutManager();

      await mgr.getOrClone(
        "test-sdk",
        "https://github.com/test/repo.git",
        "v1.0.0",
        "/tmp"
      );

      expect(mgr.getRepoDir("test-sdk")).toBe("/tmp/shared-test-sdk");
    });
  });

  describe("cleanup", () => {
    it("removes all checkout directories", async () => {
      const mgr = new CheckoutManager();

      await mgr.getOrClone(
        "sdk-a",
        "https://github.com/test/a.git",
        "v1.0.0",
        "/tmp"
      );

      await mgr.getOrClone(
        "sdk-b",
        "https://github.com/test/b.git",
        "v1.0.0",
        "/tmp"
      );

      await mgr.cleanup();

      expect(mockRemove).toHaveBeenCalledWith("/tmp/shared-sdk-a");
      expect(mockRemove).toHaveBeenCalledWith("/tmp/shared-sdk-b");
    });

    it("clears internal state after cleanup", async () => {
      const mgr = new CheckoutManager();

      await mgr.getOrClone(
        "test-sdk",
        "https://github.com/test/repo.git",
        "v1.0.0",
        "/tmp"
      );

      await mgr.cleanup();

      expect(mgr.getRepoDir("test-sdk")).toBeUndefined();
    });
  });
});

