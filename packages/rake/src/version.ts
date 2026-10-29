export const VERSION = "13.2.1";

const [MAJOR, MINOR, BUILD, ...OTHER] = VERSION.split(".");

export const Version = {
  MAJOR,
  MINOR,
  BUILD,
  OTHER,
  NUMBERS: [MAJOR, MINOR, BUILD, ...OTHER],
};
