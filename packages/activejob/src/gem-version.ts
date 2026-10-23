import { Gem, aryJoin, classModule } from "@blazetrails/ruby-compat";

export function gemVersion() {
  return new Gem.Version(VERSION.STRING as string | number | null);
}

export class VERSION {
  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::VERSION";
  }

  static MAJOR: unknown = 8;

  static MINOR: unknown = 0;

  static TINY: unknown = 2;

  static PRE: unknown = null;

  static STRING: unknown = aryJoin(
    [VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE].filter((x) => x != null),
    ".",
  );
}
