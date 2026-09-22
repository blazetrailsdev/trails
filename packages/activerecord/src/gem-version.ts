export const VERSION = {
  MAJOR: 8,
  MINOR: 0,
  TINY: 2,
  PRE: null as string | null,
  get STRING(): string {
    return [VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE]
      .filter((p) => p != null)
      .join(".");
  },
};

/** @missingRailsCall new — CONVERGEABLE gem-version-returns-string-not-gem-version */
export function gemVersion(): string {
  return VERSION.STRING;
}
