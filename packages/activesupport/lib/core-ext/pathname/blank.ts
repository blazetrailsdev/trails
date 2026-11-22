import type { Pathname } from "@blazetrails/ruby-compat";

export function isBlank(pathname: Pathname): boolean {
  return pathname.toString().length === 0;
}

export function isPresent(pathname: Pathname): boolean {
  return !(pathname.toString().length === 0);
}
