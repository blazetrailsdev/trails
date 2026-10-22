import { Gem, compact, classModule, rbModConstSet } from "@blazetrails/ruby-compat";
import { MiniMagick as MiniMagickSeat } from "./namespaces.js";

export function version() {
  return new Gem.Version(VERSION.STRING as string | number | null);
}

export const MiniMagick = MiniMagickSeat;
Object.assign(MiniMagick, { version });
export class VERSION {
  static readonly [classModule] = true;

  static toString(): string {
    return "MiniMagick::VERSION";
  }

  static MAJOR: unknown = 5;

  static MINOR: unknown = 2;

  static TINY: unknown = 0;

  static PRE: unknown = null;

  static STRING: unknown = compact([VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE]).join(
    ".",
  );
}
rbModConstSet(MiniMagickSeat, "VERSION", VERSION);
