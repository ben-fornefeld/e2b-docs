import fs from "fs-extra";
import path from "path";
import { cloneAtTag, checkoutTag } from "./git.js";
import { log } from "./log.js";

export class CheckoutManager {
  private checkouts = new Map<string, string>();

  async getOrClone(
    sdkKey: string,
    repo: string,
    tag: string,
    tempDir: string
  ): Promise<string> {
    const existing = this.checkouts.get(sdkKey);
    if (existing) {
      return existing;
    }

    const repoDir = path.join(tempDir, `shared-${sdkKey}`);
    log.info(`Cloning ${sdkKey} repository...`, 1);
    await cloneAtTag(repo, tag, repoDir);
    this.checkouts.set(sdkKey, repoDir);
    return repoDir;
  }

  async switchVersion(sdkKey: string, tag: string): Promise<void> {
    const repoDir = this.checkouts.get(sdkKey);
    if (!repoDir) {
      throw new Error(`Checkout not initialized for ${sdkKey}`);
    }

    log.info(`Switching to ${tag}...`, 1);
    await checkoutTag(repoDir, tag);
  }

  getRepoDir(sdkKey: string): string | undefined {
    return this.checkouts.get(sdkKey);
  }

  async cleanup(): Promise<void> {
    for (const [sdkKey, dir] of this.checkouts.entries()) {
      log.info(`Cleaning up ${sdkKey}...`, 1);
      await fs.remove(dir);
    }
    this.checkouts.clear();
  }
}
