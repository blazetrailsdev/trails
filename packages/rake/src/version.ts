export const VERSION = "13.2.1";

export const Version = (() => {
  const [MAJOR, MINOR, BUILD, ...OTHER] = VERSION.split(".");

  return { MAJOR, MINOR, BUILD, OTHER, NUMBERS: [MAJOR, MINOR, BUILD, ...OTHER] };
})();
