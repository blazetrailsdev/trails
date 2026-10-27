import { version } from "./version.js";
import { Configuration } from "./configuration.js";
import { Utilities } from "./utilities.js";
import { Tool } from "./tool.js";
import "./image.js";
import { extend, RuntimeError, StandardError } from "@blazetrails/ruby-compat";

export function isImagemagick7() {
  if (MiniMagick.graphicsmagick != null && MiniMagick.graphicsmagick !== false) {
    return false;
  }
  if (MiniMagick._imagemagick7 !== undefined) {
    return MiniMagick._imagemagick7;
  }
  return (MiniMagick._imagemagick7 = !!((Utilities.which("magick") ?? false) !== false));
}

export function cliVersion(): unknown {
  const output = MiniMagick.identify({}, (x: Tool) =>
    (x as unknown as { version(): Tool }).version(),
  ) as string;
  return output.match(/\d+\.\d+\.\d+(-\d+)?/)?.[0] ?? null;
}

export const MiniMagick = { version, isImagemagick7, cliVersion } as {
  version: typeof version;
  isImagemagick7: typeof isImagemagick7;
  cliVersion: typeof cliVersion;
  _imagemagick7?: boolean;
} & Configuration &
  Record<CliTool, (options?: Record<string, unknown>, block?: (tool: Tool) => unknown) => unknown>;
extend(MiniMagick, Configuration);

type CliTool =
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
    { ...options }: Record<string, unknown> = {},
    block?: (tool: Tool) => unknown,
  ) => {
    const name = isImagemagick7() && tool === "convert" ? "magick" : tool;
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
