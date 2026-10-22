import "./version.js";
import { Configuration } from "./configuration.js";
import { Utilities } from "./utilities.js";
import "./tool.js";
import "./image.js";
import { extend, RuntimeError, StandardError, rbModConstSet } from "@blazetrails/ruby-compat";
import { MiniMagick as MiniMagickSeat } from "./namespaces.js";

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
  const output = MiniMagickSeat.identify((x: unknown) => x.version);
  return output[/\d+\.\d+\.\d+(-\d+)?/];
}

export const MiniMagick = MiniMagickSeat;
Object.assign(MiniMagick, { isImagemagick7, cliVersion });
{
  extend(MiniMagick, Configuration);
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
rbModConstSet(MiniMagickSeat, "Error", Error);
rbModConstSet(MiniMagickSeat, "Invalid", Invalid);
rbModConstSet(MiniMagickSeat, "TimeoutError", TimeoutError);
