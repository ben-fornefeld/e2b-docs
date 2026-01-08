import { describe, it, expect } from 'vitest';
import {
  isValidVersion,
  versionGte,
  filterByMinVersion,
  diffVersions,
} from '../lib/versions.js';

describe('isValidVersion', () => {
  it('accepts valid semver versions', () => {
    expect(isValidVersion('1.0.0')).toBe(true);
    expect(isValidVersion('v1.0.0')).toBe(true);
    expect(isValidVersion('v2.9.0')).toBe(true);
    expect(isValidVersion('10.20.30')).toBe(true);
  });

  it('rejects invalid versions', () => {
    expect(isValidVersion('main')).toBe(false);
    expect(isValidVersion('latest')).toBe(false);
    expect(isValidVersion('1.0')).toBe(false);
    expect(isValidVersion('')).toBe(false);
  });
});

describe('versionGte', () => {
  it('compares versions correctly', () => {
    expect(versionGte('2.0.0', '1.0.0')).toBe(true);
    expect(versionGte('1.0.0', '1.0.0')).toBe(true);
    expect(versionGte('1.0.0', '2.0.0')).toBe(false);
  });

  it('handles v prefix', () => {
    expect(versionGte('v2.0.0', '1.0.0')).toBe(true);
    expect(versionGte('2.0.0', 'v1.0.0')).toBe(true);
    expect(versionGte('v2.0.0', 'v1.0.0')).toBe(true);
  });
});

describe('filterByMinVersion', () => {
  it('filters versions below minimum', () => {
    const versions = ['v0.9.0', 'v1.0.0', 'v1.5.0', 'v2.0.0'];
    const result = filterByMinVersion(versions, '1.0.0');
    expect(result).toEqual(['v1.0.0', 'v1.5.0', 'v2.0.0']);
  });

  it('returns all versions when no minimum specified', () => {
    const versions = ['v0.9.0', 'v1.0.0', 'v2.0.0'];
    const result = filterByMinVersion(versions);
    expect(result).toEqual(versions);
  });

  it('handles empty array', () => {
    expect(filterByMinVersion([], '1.0.0')).toEqual([]);
  });
});

describe('diffVersions', () => {
  it('finds versions in remote not in local', () => {
    const remote = ['v1.0.0', 'v2.0.0', 'v3.0.0'];
    const local = ['v1.0.0', 'v3.0.0'];
    expect(diffVersions(remote, local)).toEqual(['v2.0.0']);
  });

  it('returns all remote when local is empty', () => {
    const remote = ['v1.0.0', 'v2.0.0'];
    expect(diffVersions(remote, [])).toEqual(remote);
  });

  it('returns empty when all versions exist locally', () => {
    const versions = ['v1.0.0', 'v2.0.0'];
    expect(diffVersions(versions, versions)).toEqual([]);
  });
});

