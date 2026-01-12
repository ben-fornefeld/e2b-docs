# SDK Versioning Documentation

This document tracks the version-specific configuration changes for each SDK.

## JavaScript SDK (js-sdk)

### Verified Version History

All version ranges have been verified by checking actual git tags and TypeDoc configurations.

| Version Range | Entry Points | Notes |
|--------------|-------------|--------|
| `1.0.0` | sandbox/index.ts, filesystem/index.ts, process/index.ts, **pty.ts**, errors.ts | Used pty.ts instead of commands.ts |
| `>=1.1.0 <2.3.0` | sandbox/index.ts, filesystem/index.ts, process/index.ts, **commands/index.ts**, errors.ts | Standard sandbox APIs |
| `>=2.3.0` | + **template/index.ts**, **template/readycmd.ts**, **template/logger.ts** | Added template build support |

### Configuration in sdks.config.ts

```typescript
"js-sdk": {
  defaultConfig: {
    entryPoints: [
      // v2.3.0+ configuration (with template modules)
      "src/sandbox/index.ts",
      "src/sandbox/filesystem/index.ts",
      "src/sandbox/process/index.ts",
      "src/sandbox/commands/index.ts",
      "src/errors.ts",
      "src/template/index.ts",
      "src/template/readycmd.ts",
      "src/template/logger.ts",
    ],
  },
  configOverrides: {
    "1.0.0": {
      entryPoints: [/* pty.ts version */],
    },
    ">=1.1.0 <2.3.0": {
      entryPoints: [/* without template */],
    },
  },
}
```

## Python SDK (python-sdk)

### Verified Version History

All version ranges have been verified by checking actual git tags and package structure.

| Version Range | Allowed Packages | Notes |
|--------------|-----------------|--------|
| `>=1.0.0 <2.1.0` | e2b.sandbox_sync, e2b.sandbox_async, e2b.exceptions | Basic sandbox APIs only |
| `>=2.1.0` | + e2b.template, e2b.template_sync, e2b.template_async, e2b.template.logger, e2b.template.readycmd | Template SDK added in v2.1.0 (PR #871) |

### Configuration in sdks.config.ts

```typescript
"python-sdk": {
  defaultConfig: {
    allowedPackages: [
      // v2.1.0+ configuration (with template modules)
      "e2b.sandbox_sync",
      "e2b.sandbox_async",
      "e2b.exceptions",
      "e2b.template",
      "e2b.template_sync",
      "e2b.template_async",
      "e2b.template.logger",
      "e2b.template.readycmd",
    ],
  },
  configOverrides: {
    ">=1.0.0 <2.1.0": {
      allowedPackages: [
        "e2b.sandbox_sync",
        "e2b.sandbox_async",
        "e2b.exceptions",
      ],
    },
  },
}
```

## Code Interpreter SDKs

### code-interpreter-js-sdk

**Current Configuration**: Single entry point (`src/index.ts`)

No version-specific overrides needed - the SDK has a simple, stable structure since v1.0.0. The code-interpreter is a focused wrapper around the base E2B SDK for code execution.

### code-interpreter-python-sdk

**Current Configuration**: Single package (`e2b_code_interpreter`)

No version-specific overrides needed - the Python package structure has remained consistent.

## Desktop SDKs

### desktop-js-sdk & desktop-python-sdk

**Current Configuration**: Simple defaults (`src/index.ts` and `e2b_desktop`)

No version-specific overrides needed yet. These SDKs are relatively new and haven't had breaking structural changes requiring versioned configs.

**Note**: If any of these SDKs introduce breaking changes in future versions (e.g., new modules, renamed packages), add appropriate `configOverrides` following the same pattern used for js-sdk and python-sdk.

## Adding New Version Overrides

When you discover that a specific version range needs different configuration:

1. **Identify the version range** using semver syntax (e.g., `>=1.5.0 <2.0.0`)
2. **Add to configOverrides** with partial config (only override what changed)
3. **Add tests** in `src/__tests__/sdks-config.test.ts`
4. **Document here** with notes on what changed and why

### Example: Adding a new override

```typescript
configOverrides: {
  ">=1.0.0 <1.5.0": {
    // Old structure
  },
  ">=1.5.0 <2.0.0": {
    // New structure introduced in 1.5.0
  },
  ">=2.0.0": {
    // Breaking changes in 2.0.0
  },
}
```

## Resolution Logic

The config resolution follows these rules:

1. Start with `defaultConfig`
2. Find the **first matching** semver range in `configOverrides`
3. Shallow merge override into default (override wins)
4. Return merged config

This means:
- `defaultConfig` should represent the **latest/current** structure
- `configOverrides` handles older versions or special cases
- Order matters when multiple ranges could match (first match wins)

## Testing

Tests in `src/__tests__/sdks-config.test.ts` verify:
- Correct packages/entry points for each version range
- Proper semver range matching
- Expected counts of items per version

Run tests with:
```bash
pnpm test src/__tests__/sdks-config.test.ts
```

