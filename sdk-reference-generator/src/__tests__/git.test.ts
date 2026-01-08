import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClone = vi.fn();
const mockListRemote = vi.fn();

// mock simple-git before importing our module
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    clone: mockClone,
    listRemote: mockListRemote,
  })),
}));

// mock timers to avoid actual delays in tests
vi.useFakeTimers();

// now import our module after mocking
const { cloneAtTag } = await import('../lib/git.js');

describe('cloneAtTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClone.mockReset();
    mockListRemote.mockReset();
  });

  it('succeeds on first attempt', async () => {
    mockClone.mockResolvedValueOnce(undefined as any);

    await expect(
      cloneAtTag('https://github.com/test/repo', 'v1.0.0', '/tmp/test')
    ).resolves.toBeUndefined();

    expect(mockClone).toHaveBeenCalledTimes(1);
    expect(mockClone).toHaveBeenCalledWith(
      'https://github.com/test/repo',
      '/tmp/test',
      ['--depth', '1', '--branch', 'v1.0.0']
    );
  });

  it('retries 3 times for tag-not-found errors', async () => {
    const tagNotFoundError = new Error(
      "fatal: Remote branch v1.0.0 not found in upstream origin"
    );

    mockClone
      .mockRejectedValueOnce(tagNotFoundError)
      .mockRejectedValueOnce(tagNotFoundError)
      .mockRejectedValueOnce(tagNotFoundError);

    const promise = expect(
      cloneAtTag('https://github.com/test/repo', 'v1.0.0', '/tmp/test')
    ).rejects.toThrow(/Tag v1\.0\.0 not found in repository.*after 3 attempts/);
    
    // advance timers for all retry delays
    await vi.runAllTimersAsync();
    await promise;

    expect(mockClone).toHaveBeenCalledTimes(3);
  });

  it('succeeds on second attempt after tag-not-found retry', async () => {
    const tagNotFoundError = new Error(
      "fatal: Remote branch v1.0.0 not found in upstream origin"
    );

    mockClone
      .mockRejectedValueOnce(tagNotFoundError)
      .mockResolvedValueOnce(undefined as any);

    const promise = expect(
      cloneAtTag('https://github.com/test/repo', 'v1.0.0', '/tmp/test')
    ).resolves.toBeUndefined();
    
    // advance timers for retry delay
    await vi.runAllTimersAsync();
    await promise;

    expect(mockClone).toHaveBeenCalledTimes(2);
  });

  it('throws immediately for network errors without retrying', async () => {
    const networkError = new Error(
      "fatal: unable to access 'https://github.com/test/repo': Could not resolve host"
    );

    mockClone.mockRejectedValueOnce(networkError);

    await expect(
      cloneAtTag('https://github.com/test/repo', 'v1.0.0', '/tmp/test')
    ).rejects.toThrow(/Failed to clone repository.*network, authentication, or system error/);

    // should NOT retry for network errors
    expect(mockClone).toHaveBeenCalledTimes(1);
  });

  it('throws immediately for authentication errors without retrying', async () => {
    const authError = new Error(
      "fatal: Authentication failed for 'https://github.com/test/repo'"
    );

    mockClone.mockRejectedValueOnce(authError);

    await expect(
      cloneAtTag('https://github.com/test/repo', 'v1.0.0', '/tmp/test')
    ).rejects.toThrow(/Failed to clone repository.*network, authentication, or system error/);

    expect(mockClone).toHaveBeenCalledTimes(1);
  });

  it('recognizes various tag-not-found error formats', async () => {
    const errorFormats = [
      "fatal: Remote branch v1.0.0 not found in upstream origin",
      "fatal: couldn't find remote ref v1.0.0",
      "error: invalid refspec 'v1.0.0'",
      "fatal: reference is not a tree: v1.0.0",
    ];

    for (const errorMessage of errorFormats) {
      vi.clearAllMocks();
      mockClone.mockReset();
      const error = new Error(errorMessage);
      
      mockClone
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      const promise = expect(
        cloneAtTag('https://github.com/test/repo', 'v1.0.0', '/tmp/test')
      ).rejects.toThrow(/Tag v1\.0\.0 not found/);
      
      // advance timers for all retry delays
      await vi.runAllTimersAsync();
      await promise;

      // should retry for all tag-not-found formats
      expect(mockClone).toHaveBeenCalledTimes(3);
    }
  });
});

