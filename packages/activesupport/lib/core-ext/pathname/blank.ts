import type { Pathname as RubyPathname } from "@blazetrails/ruby-compat";

export class Pathname {
  static isBlank(value: RubyPathname): boolean {
    return value.toString().length === 0;
  }

  static isPresent(value: RubyPathname): boolean {
    return !(value.toString().length === 0);
  }
}
