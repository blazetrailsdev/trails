import type { Pathname } from "@blazetrails/ruby-compat/pathname";

export function existence<T extends Pathname>(pathname: T): T | null {
  if (pathname.isExist()) return pathname;
  return null;
}
