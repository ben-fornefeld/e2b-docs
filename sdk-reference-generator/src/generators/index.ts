import type { SDKConfig, GenerationContext } from "../types.js";
import { generateTypedoc } from "./typedoc.js";
import { generatePydoc } from "./pydoc.js";
import { generateCli } from "./cli.js";

export async function runGenerator(
  sdkDir: string,
  config: SDKConfig,
  context: GenerationContext
): Promise<string> {
  switch (config.generator) {
    case "typedoc":
      return await generateTypedoc(sdkDir, context.configsDir);

    case "pydoc":
      return await generatePydoc(sdkDir, config.allowedPackages);

    case "cli":
      return await generateCli(sdkDir);
  }
}

export { generateTypedoc } from "./typedoc.js";
export { generatePydoc } from "./pydoc.js";
export { generateCli } from "./cli.js";
