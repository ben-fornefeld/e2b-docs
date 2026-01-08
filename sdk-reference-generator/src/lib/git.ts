import { simpleGit, SimpleGit } from 'simple-git';
import { sortVersionsDescending } from './utils.js';

const git: SimpleGit = simpleGit();

export async function fetchRemoteTags(
  repo: string,
  tagPattern: string
): Promise<string[]> {
  const output = await git.listRemote(['--tags', '--refs', repo]);

  const versions = output
    .split('\n')
    .filter((line: string) => line.includes(`refs/tags/${tagPattern}`))
    .map((line: string) => {
      const match = line.match(/refs\/tags\/(.+)$/);
      if (!match) return null;
      const tag = match[1];
      return 'v' + tag.replace(tagPattern, '');
    })
    .filter((v: string | null): v is string => v !== null && v !== 'v');

  return sortVersionsDescending(versions);
}

export async function cloneAtTag(
  repo: string,
  tag: string,
  targetDir: string
): Promise<void> {
  try {
    await git.clone(repo, targetDir, ['--depth', '1', '--branch', tag]);
  } catch {
    console.log(`  ⚠️  Tag ${tag} not found, trying default branch...`);
    await git.clone(repo, targetDir, ['--depth', '1']);
  }
}

export async function resolveLatestVersion(
  repo: string,
  tagPattern: string,
  version: string
): Promise<string | null> {
  if (version !== 'latest') {
    return version;
  }

  const versions = await fetchRemoteTags(repo, tagPattern);
  return versions[0] || null;
}

