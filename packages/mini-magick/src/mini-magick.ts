import { version } from "./version.js";
import { Configuration } from "./configuration.js";
import { Utilities } from "./utilities.js";
import "./tool.js";
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
  const output = MiniMagick.identify((x: unknown) => x.version);
  return output[/\d+\.\d+\.\d+(-\d+)?/];
}

export const MiniMagick = { version, isImagemagick7, cliVersion } as {
  version: typeof version;
  isImagemagick7: typeof isImagemagick7;
  cliVersion: typeof cliVersion;
  _imagemagick7?: boolean;
} & Configuration;
extend(MiniMagick, Configuration);
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
