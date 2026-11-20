import type { Pathname } from "@blazetrails/ruby-compat";

export function existence<T extends Pathname>(pathname: T): T | null {
  if (pathname.isExist()) return pathname;
  return null;
}
