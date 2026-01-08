import { execa } from "execa";
import type { GeneratorType } from "../types.js";
import { log } from "./log.js";

export async function installDependencies(
  sdkDir: string,
  generator: GeneratorType
): Promise<void> {
  log.info("Installing dependencies...", 1);

  switch (generator) {
    case "typedoc":
    case "cli": {
      const isTypedoc = generator === "typedoc";
      const pnpmArgs = isTypedoc
        ? ["install", "--ignore-scripts", "--prefer-offline"]
        : ["install", "--prefer-offline"];

      try {
        await execa("pnpm", pnpmArgs, {
          cwd: sdkDir,
          stdio: "inherit",
        });
      } catch {
        log.warn("pnpm failed, falling back to npm...", 1);
        await execa(
          "npm",
          ["install", "--legacy-peer-deps", "--force", "--prefer-offline"],
          {
            cwd: sdkDir,
            stdio: "inherit",
          }
        );
      }
      break;
    }

    case "pydoc": {
      try {
        await execa("poetry", ["install", "--no-interaction"], {
          cwd: sdkDir,
          stdio: "inherit",
        });
      } catch {
        log.warn("poetry failed, using global pydoc-markdown...", 1);
        await execa(
          "pip",
          ["install", "--break-system-packages", "pydoc-markdown"],
          {
            cwd: sdkDir,
            stdio: "inherit",
          }
        );
      }
      break;
    }
  }
}
