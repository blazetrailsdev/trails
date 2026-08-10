/**
 * The merged unported-file register. Entry schema lives in ./types.ts, the
 * entries themselves in the per-package modules.
 *
 * Entry order carries no meaning — every predicate here is a `.some()`
 * existence check over the whole array — so the concatenation below is fixed
 * only to keep the merged array deterministic.
 */

import type { UnportedFile } from "./types.js";
import { ACTIVERECORD_TEST_SUPPORT_UNPORTED_FILES } from "./activerecord-test-support.js";
import { ACTIVESUPPORT_UNPORTED_FILES } from "./activesupport.js";
import { DATE_UNPORTED_FILES } from "./date.js";
import { DID_YOU_MEAN_UNPORTED_FILES } from "./did-you-mean.js";
import { GLOBALID_UNPORTED_FILES } from "./globalid.js";
import { I18N_UNPORTED_FILES } from "./i18n.js";
import { UNSCOPED_UNPORTED_FILES } from "./unscoped.js";

export type { UnportedFile } from "./types.js";

export const UNPORTED_FILES: UnportedFile[] = [
  ...ACTIVERECORD_TEST_SUPPORT_UNPORTED_FILES,
  ...ACTIVESUPPORT_UNPORTED_FILES,
  ...DATE_UNPORTED_FILES,
  ...DID_YOU_MEAN_UNPORTED_FILES,
  ...GLOBALID_UNPORTED_FILES,
  ...I18N_UNPORTED_FILES,
  ...UNSCOPED_UNPORTED_FILES,
];

export function isSourceUnported(file: string, pkg?: string): boolean {
  return UNPORTED_FILES.some((e) => {
    if (!e.pattern) return false;
    // A leading "/" anchors the pattern to a path boundary — same rule as
    // `isTestFileUnported` below — so a basename entry cannot swallow a longer
    // basename that ends with it (`version.rb` vs `gem_version.rb`).
    const matched = e.pattern.startsWith("/")
      ? file === e.pattern.slice(1) || file.includes(e.pattern)
      : file.includes(e.pattern);
    if (!matched) return false;
    // `package` only exists on the pattern-bearing variant of the union.
    const scope = "package" in e ? e.package : undefined;
    return scope === undefined || pkg === undefined || scope === pkg;
  });
}

export function isTestFileUnported(testFile: string, pkg?: string): boolean {
  return UNPORTED_FILES.some((e) => {
    if (!e.testFile || e.tests) return false;
    const scope = "package" in e ? e.package : undefined;
    if (scope !== undefined && pkg !== undefined && scope !== pkg) return false;
    const p = e.testFile;
    // A leading "/" anchors the pattern to a path boundary: match the exact
    // basename (`testFile === p.slice(1)`, for top-level files with no dir
    // prefix) or a literal substring with the slash (`testFile.includes(p)`,
    // for files under a subdir).  Without a leading "/", plain substring.
    if (p.startsWith("/")) return testFile === p.slice(1) || testFile.includes(p);
    return testFile.includes(p);
  });
}

export function isTestCaseUnported(
  testFile: string,
  testName: string,
  className?: string,
): boolean {
  return UNPORTED_FILES.some(
    (e) =>
      e.testFile &&
      e.tests &&
      testFile.includes(e.testFile) &&
      e.tests.includes(testName) &&
      (e.className === undefined || e.className === className),
  );
}
