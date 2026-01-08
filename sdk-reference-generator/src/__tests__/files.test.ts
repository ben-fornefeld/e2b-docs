import { describe, it, expect } from 'vitest';
import { toTitleCase } from '../lib/files.js';

describe('toTitleCase', () => {
  it('converts snake_case to Title Case', () => {
    expect(toTitleCase('sandbox_sync')).toBe('Sandbox Sync');
    expect(toTitleCase('sandbox_async')).toBe('Sandbox Async');
    expect(toTitleCase('template_async')).toBe('Template Async');
  });

  it('capitalizes single words', () => {
    expect(toTitleCase('sandbox')).toBe('Sandbox');
    expect(toTitleCase('exceptions')).toBe('Exceptions');
  });

  it('handles already capitalized words', () => {
    expect(toTitleCase('Sandbox')).toBe('Sandbox');
    expect(toTitleCase('SANDBOX')).toBe('SANDBOX');
  });

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('');
  });

  it('handles multiple underscores', () => {
    expect(toTitleCase('a_b_c')).toBe('A B C');
  });
});

