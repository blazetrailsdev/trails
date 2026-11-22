export const VERSION = {
  MAJOR: 8,
  MINOR: 0,
  TINY: 5,
  PRE: "2" as string | null,
  get STRING(): string {
    return [VERSION.MAJOR, VERSION.MINOR, VERSION.TINY, VERSION.PRE]
      .filter((p) => p != null)
      .join(".");
  },
};

export function gemVersion(): string {
  return VERSION.STRING;
}
