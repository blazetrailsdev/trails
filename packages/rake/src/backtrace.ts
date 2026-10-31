import { File, RbConfig, regexpEscape } from "@blazetrails/ruby-compat";
import { Rake } from "./rake-module.js";

const SYS_KEYS = Object.keys(RbConfig.CONFIG).filter((k) => /(?:[a-z]prefix|libdir)$/.test(k));
const SYS_PATHS = [
  ...new Set(SYS_KEYS.map((k) => RbConfig.CONFIG[k])),
  File.join(File.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), ".."),
  File.join(
    File.dirname(decodeURIComponent(new URL(import.meta.url).pathname)),
    "../../ruby-compat",
  ),
];

const SUPPRESSED_PATHS = SYS_PATHS.map((s) => s.replaceAll("\\", "/"))
  .map((f) => File.expandPath(f))
  .filter((s) => !/^ *$/m.test(s));
/** @noRailsEquivalent PERMANENT */
const SUPPRESSED_PATHS_RE =
  SUPPRESSED_PATHS.map((f) => regexpEscape(f)).join("|") +
  "|^<internal:\\w+>|node:|<anonymous>\\)$";

export const Backtrace = {
  SYS_KEYS,
  SYS_PATHS,
  SUPPRESSED_PATHS,
  SUPPRESSED_PATHS_RE,
  SUPPRESS_PATTERN: new RegExp(
    `^(?:at (?:async )?(?:.*\\()?(?:file://)?)?(?:${SUPPRESSED_PATHS_RE})|bin/rake:\\d+`,
    "i",
  ),

  collapse(backtrace: string[]): string[] {
    const pattern =
      Rake.application!.options.suppressBacktracePattern ?? Backtrace.SUPPRESS_PATTERN;
    return backtrace.filter((elem) => !pattern.test(elem));
  },
};
