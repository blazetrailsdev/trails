const MAJOR = 2;
const MINOR = 8;
const PATCH = 1;
const BUILD = null;

const STRING = [MAJOR, MINOR, PATCH, BUILD].filter((x) => x != null).join(".");

export const VERSION = {
  MAJOR,
  MINOR,
  PATCH,
  BUILD,
  STRING,

  version(): string {
    return STRING;
  },
};
