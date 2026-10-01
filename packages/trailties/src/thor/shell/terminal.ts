import { env, getChildProcess, RUBY_PLATFORM, toI } from "@blazetrails/ruby-compat";

export const DEFAULT_TERMINAL_WIDTH = 80;

let _dynamicWidth: number | undefined;

export function terminalWidth(): number {
  try {
    let result: number;
    if (env["THOR_COLUMNS"] != null) {
      result = Number(toI(env["THOR_COLUMNS"]));
    } else {
      result = isUnix() ? dynamicWidth() : DEFAULT_TERMINAL_WIDTH;
    }
    return result < 10 ? DEFAULT_TERMINAL_WIDTH : result;
  } catch {
    return DEFAULT_TERMINAL_WIDTH;
  }
}

export function isUnix(): boolean {
  return /(aix|darwin|linux|(net|free|open)bsd|cygwin|solaris)/i.test(RUBY_PLATFORM());
}

/** @internal */
function dynamicWidth(): number {
  return (_dynamicWidth ??= dynamicWidthStty() || dynamicWidthTput());
}

/** @internal */
function dynamicWidthStty(): number {
  return Number(toI(getChildProcess().spawnSync("stty", ["size"]).stdout.trim().split(/\s+/)[1]));
}

/** @internal */
function dynamicWidthTput(): number {
  return Number(toI(getChildProcess().spawnSync("tput", ["cols"]).stdout));
}
