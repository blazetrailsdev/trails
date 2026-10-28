import { version } from "./version.js";
import { Configuration } from "./configuration.js";
import { Utilities } from "./utilities.js";
import { Tool, type CliTool } from "./tool.js";
import "./image.js";
import {
  extend,
  RuntimeError,
  StandardError,
  block as blockPass,
  rbBlockGivenP,
} from "@blazetrails/ruby-compat";

export function isImagemagick7() {
  if (MiniMagick.graphicsmagick != null && MiniMagick.graphicsmagick !== false) {
    return false;
  }
  if (MiniMagick._imagemagick7 !== undefined) {
    return MiniMagick._imagemagick7;
  }
  return (MiniMagick._imagemagick7 = !!((Utilities.which("magick") ?? false) !== false));
}

export async function cliVersion(): Promise<string | null> {
  const output = await (MiniMagick.identify(
    blockPass((x: CliTool) => x.version()),
  ) as Promise<string>);
  return output.match(/\d+\.\d+\.\d+(-\d+)?/)?.[0] ?? null;
}

export const MiniMagick = { version, isImagemagick7, cliVersion } as {
  version: typeof version;
  isImagemagick7: typeof isImagemagick7;
  cliVersion: typeof cliVersion;
  _imagemagick7?: boolean;
} & Configuration &
  Record<
    ToolName,
    (
      ...args:
        | [Record<string, unknown>?, ((tool: CliTool) => unknown)?]
        | [(tool: CliTool) => unknown]
    ) => unknown
  >;
extend(MiniMagick, Configuration);

type ToolName =
  | "animate"
  | "compare"
  | "composite"
  | "conjure"
  | "convert"
  | "display"
  | "identify"
  | "import"
  | "mogrify"
  | "montage"
  | "stream";

for (const tool of [
  "animate",
  "compare",
  "composite",
  "conjure",
  "convert",
  "display",
  "identify",
  "import",
  "mogrify",
  "montage",
  "stream",
] as const) {
  MiniMagick[tool] = (
    ...args:
      | [Record<string, unknown>?, ((tool: CliTool) => unknown)?]
      | [(tool: CliTool) => unknown]
  ) => {
    const block = rbBlockGivenP(args.at(-1))
      ? (args.pop() as (tool: CliTool) => unknown)
      : undefined;
    const options = (args[0] ?? {}) as Record<string, unknown>;
    const name = MiniMagick.isImagemagick7() && tool === "convert" ? "magick" : tool;
    return Tool.new(name, options, block);
  };
}
export class Error extends RuntimeError {
  static toString(): string {
    return "MiniMagick::Error";
  }
}
export class Invalid extends StandardError {
  static toString(): string {
    return "MiniMagick::Invalid";
  }
}
export class TimeoutError extends Error {
  static toString(): string {
    return "MiniMagick::TimeoutError";
  }
}

import "./class-paths.generated.js";
