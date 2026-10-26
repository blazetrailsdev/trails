import { compact, env, isSymbol, rbConstGet, rtest, symbolToS } from "@blazetrails/ruby-compat";
import { Basic } from "./basic.js";

export class Color extends Basic {
  static readonly CLEAR = "\x1b[0m";
  static readonly BOLD = "\x1b[1m";

  static readonly BLACK = "\x1b[30m";
  static readonly RED = "\x1b[31m";
  static readonly GREEN = "\x1b[32m";
  static readonly YELLOW = "\x1b[33m";
  static readonly BLUE = "\x1b[34m";
  static readonly MAGENTA = "\x1b[35m";
  static readonly CYAN = "\x1b[36m";
  static readonly WHITE = "\x1b[37m";

  static readonly ON_BLACK = "\x1b[40m";
  static readonly ON_RED = "\x1b[41m";
  static readonly ON_GREEN = "\x1b[42m";
  static readonly ON_YELLOW = "\x1b[43m";
  static readonly ON_BLUE = "\x1b[44m";
  static readonly ON_MAGENTA = "\x1b[45m";
  static readonly ON_CYAN = "\x1b[46m";
  static readonly ON_WHITE = "\x1b[47m";

  setColor(string: string, ...colors: unknown[]): string {
    if (compact(colors).length === 0 || !this.canDisplayColors()) {
      return string;
    } else if (colors.every((color) => isSymbol(color) || typeof color === "string")) {
      const ansiColors = colors.map((color) => this.lookupColor(color));
      return `${ansiColors.join("")}${string}${Color.CLEAR}`;
    } else {
      let [foreground, bold] = colors;
      if (isSymbol(foreground)) {
        foreground = rbConstGet(this.constructor, symbolToS(foreground).toUpperCase());
      }

      bold = rtest(bold) ? Color.BOLD : "";
      return `${bold}${foreground}${string}${Color.CLEAR}`;
    }
  }

  /** @internal */
  protected canDisplayColors(): boolean {
    return this.areColorsSupported() && !this.areColorsDisabled();
  }

  /** @internal */
  protected areColorsSupported(): boolean {
    return this.stdout().isTTY && env["TERM"] !== "dumb";
  }

  /** @internal */
  protected areColorsDisabled(): boolean {
    return env["NO_COLOR"] != null && env["NO_COLOR"] !== "";
  }
}
