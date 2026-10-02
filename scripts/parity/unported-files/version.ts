import type { UnportedFile } from "./types.js";

const STORIES: Record<string, string> = {
  activerecord: "activerecord-port-version-and-gem-version",
  activesupport: "activesupport-port-version-rb",
  actionview: "actionview-port-version-rb",
  trailties: "trailties-port-version-rb",
};

/**
 * `version.rb`, one entry per package that has not ported it. A package
 * leaves by deleting its name from `STORIES`. Schema: ./types.ts.
 */
export const VERSION_UNPORTED_FILES: UnportedFile[] = [
  ...Object.entries(STORIES).map(([pkg, story]) => ({
    pattern: "/version.rb",
    package: pkg,
    reason:
      `\`Module.version\` is not ported yet (story ${story}). Anchored ` +
      "(leading `/`) so it cannot also exclude `gem_version.rb`, which owns " +
      "real surface (`ActionPack.gem_version`).",
  })),
  {
    pattern: "/version.rb",
    package: "i18n",
    reason:
      "`i18n/version.rb` defines only the `I18n::VERSION` constant. trails " +
      "carries the version in package.json, so there is no method to port.",
  },
];
