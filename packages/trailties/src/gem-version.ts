const MAJOR = 0;
const MINOR = 1;
const TINY = 0;
const PRE: string | null = null;

export const VERSION = {
  MAJOR,
  MINOR,
  TINY,
  PRE,
  STRING: [MAJOR, MINOR, TINY, PRE].filter((part) => part != null).join("."),
};
