import { Gem, classModule } from "@blazetrails/ruby-compat";

export function version() {
  return new Gem.Version(VERSION.STRING as string | number | null);
}

export class VERSION {
  static readonly [classModule] = true;

  static toString(): string {
    return "MiniMagick::VERSION";
  }

  static MAJOR: unknown = 5;

  static MINOR: unknown = 2;

  static TINY: unknown = 0;

  static PRE: unknown = null;

  static STRING: unknown = [VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE]
    .filter((x) => x != null)
    .join(".");
}
