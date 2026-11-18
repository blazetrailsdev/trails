import { Gem } from "@blazetrails/ruby-compat";

export const VERSION = "1.1.3";

export function nextMajorVersion(): number {
  return (new Gem.Version(VERSION).segments()[0] as number) + 1;
}
