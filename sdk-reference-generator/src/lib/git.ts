import { simpleGit, SimpleGit } from "simple-git";
import { sortVersionsDescending } from "./utils.js";
import { log } from "./log.js";

const git: SimpleGit = simpleGit();

export async function fetchRemoteTags(
  repo: string,
  tagPattern: string
): Promise<string[]> {
  const output = await git.listRemote(["--tags", "--refs", repo]);

  const versions = output
    .split("\n")
    .filter((line: string) => line.includes(`refs/tags/${tagPattern}`))
    .map((line: string) => {
      const match = line.match(/refs\/tags\/(.+)$/);
      if (!match) return null;
      const tag = match[1];
      return "v" + tag.replace(tagPattern, "");
    })
    .filter((v: string | null): v is string => v !== null && v !== "v");

  return sortVersionsDescending(versions);
}

function isTagNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    (message.includes("remote branch") && message.includes("not found")) ||
    message.includes("couldn't find remote ref") ||
    message.includes("invalid refspec") ||
    message.includes("reference is not a tree")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function cloneAtTag(
  repo: string,
  tag: string,
  targetDir: string
): Promise<void> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await git.clone(repo, targetDir, ["--depth", "1", "--branch", tag]);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // only retry if it's a tag-not-found error
      if (!isTagNotFoundError(error)) {
        throw new Error(
          `Failed to clone repository: ${lastError.message}. ` +
            `This appears to be a network, authentication, or system error, not a missing tag.`
        );
      }

      if (attempt < maxRetries) {
        const backoffMs = attempt * 1000;
        log.warn(
          `Tag ${tag} not found (attempt ${attempt}/${maxRetries}), retrying in ${backoffMs}ms...`,
          1
        );
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(
    `Tag ${tag} not found in repository ${repo} after ${maxRetries} attempts. ` +
      `Cancelling generation to avoid publishing incorrect documentation. ` +
      `Original error: ${lastError?.message}`
  );
}

export async function resolveLatestVersion(
  repo: string,
  tagPattern: string,
  version: string
): Promise<string | null> {
  if (version !== "latest") {
    return version;
  }

  const versions = await fetchRemoteTags(repo, tagPattern);
  return versions[0] || null;
}

export async function checkoutTag(repoDir: string, tag: string): Promise<void> {
  const repoGit = simpleGit(repoDir);

  // fetch the specific tag with minimal depth
  await repoGit.fetch([
    "origin",
    `refs/tags/${tag}:refs/tags/${tag}`,
    "--depth",
    "1",
  ]);

  // force checkout to discard any local changes
  await repoGit.checkout(tag, ["--force"]);

  // clean untracked files (like node_modules changes)
  await repoGit.clean("f", ["-d"]);
}
