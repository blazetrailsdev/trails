import { Gem } from "@blazetrails/ruby-compat";

export const VERSION = {
  MAJOR: 8,
  MINOR: 0,
  TINY: 2,
  PRE: null as string | null,
  get STRING(): string {
    return [VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE]
      .filter((p) => p != null)
      .join(".");
  },
};

export function gemVersion(): InstanceType<typeof Gem.Version> {
  return new Gem.Version(VERSION.STRING);
}
