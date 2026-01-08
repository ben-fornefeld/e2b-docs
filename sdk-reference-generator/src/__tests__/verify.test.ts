import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { verifyGeneratedDocs, verifyDocsJson } from '../lib/verify.js';
import { CONSTANTS } from '../lib/constants.js';

describe('verifyGeneratedDocs', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('validates correct SDK structure', async () => {
    const sdkPath = path.join(tempDir, CONSTANTS.DOCS_SDK_REF_PATH, 'test-sdk', 'v1.0.0');
    await fs.ensureDir(sdkPath);
    await fs.writeFile(
      path.join(sdkPath, 'test.mdx'),
      '---\nsidebarTitle: "Test"\n---\n\nContent'
    );

    const result = await verifyGeneratedDocs(tempDir);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.totalMdxFiles).toBe(1);
    expect(result.stats.totalSDKs).toBe(1);
    expect(result.stats.totalVersions).toBe(1);
  });

  it('detects empty MDX files', async () => {
    const sdkPath = path.join(tempDir, CONSTANTS.DOCS_SDK_REF_PATH, 'test-sdk', 'v1.0.0');
    await fs.ensureDir(sdkPath);
    await fs.writeFile(path.join(sdkPath, 'empty.mdx'), '');

    const result = await verifyGeneratedDocs(tempDir);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Empty file');
  });

  it('detects missing frontmatter', async () => {
    const sdkPath = path.join(tempDir, CONSTANTS.DOCS_SDK_REF_PATH, 'test-sdk', 'v1.0.0');
    await fs.ensureDir(sdkPath);
    await fs.writeFile(path.join(sdkPath, 'no-frontmatter.mdx'), 'Just content');

    const result = await verifyGeneratedDocs(tempDir);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Missing frontmatter');
  });

  it('warns about versions with no MDX files', async () => {
    const sdkPath = path.join(tempDir, CONSTANTS.DOCS_SDK_REF_PATH, 'test-sdk', 'v1.0.0');
    await fs.ensureDir(sdkPath);

    const result = await verifyGeneratedDocs(tempDir);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('has no MDX files');
  });
});

describe('verifyDocsJson', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('validates correct docs.json structure', async () => {
    const docsJson = {
      navigation: {
        anchors: [
          {
            anchor: CONSTANTS.SDK_REFERENCE_ANCHOR,
            icon: 'brackets-curly',
            dropdowns: [],
          },
        ],
      },
    };

    await fs.writeJSON(path.join(tempDir, 'docs.json'), docsJson);

    const result = await verifyDocsJson(tempDir);
    expect(result).toBe(true);
  });

  it('fails when docs.json missing', async () => {
    const result = await verifyDocsJson(tempDir);
    expect(result).toBe(false);
  });

  it('fails when SDK Reference anchor missing', async () => {
    const docsJson = {
      navigation: {
        anchors: [{ anchor: 'Other', dropdowns: [] }],
      },
    };

    await fs.writeJSON(path.join(tempDir, 'docs.json'), docsJson);

    const result = await verifyDocsJson(tempDir);
    expect(result).toBe(false);
  });
});

