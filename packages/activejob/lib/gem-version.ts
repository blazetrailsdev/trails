import { Gem } from "@blazetrails/ruby-compat";

export function gemVersion(): InstanceType<typeof Gem.Version> {
  return new Gem.Version(VERSION.STRING);
}

const MAJOR = 8;
const MINOR = 0;
const TINY = 5;
const PRE: string | null = "2";

export const VERSION = {
  MAJOR,
  MINOR,
  TINY,
  PRE,
  STRING: [MAJOR, MINOR, TINY, PRE].filter((p) => p != null).join("."),
};
