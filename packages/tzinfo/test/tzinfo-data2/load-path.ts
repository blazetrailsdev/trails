export const loadPath: Record<string, () => Promise<unknown>> = {
  "tzinfo/data": () => import("./tzinfo/data.js"),
  "tzinfo-data2/tzinfo/data/definitions/America/Argentina/Buenos_Aires": () =>
    import("./tzinfo/data/definitions/America/Argentina/Buenos_Aires.js"),
  "tzinfo-data2/tzinfo/data/definitions/America/New_York": () =>
    import("./tzinfo/data/definitions/America/New_York.js"),
  "tzinfo-data2/tzinfo/data/definitions/Australia/Melbourne": () =>
    import("./tzinfo/data/definitions/Australia/Melbourne.js"),
  "tzinfo-data2/tzinfo/data/definitions/EST": () => import("./tzinfo/data/definitions/EST.js"),
  "tzinfo-data2/tzinfo/data/definitions/Etc/GMT__m__1": () =>
    import("./tzinfo/data/definitions/Etc/GMT__m__1.js"),
  "tzinfo-data2/tzinfo/data/definitions/Etc/GMT__p__1": () =>
    import("./tzinfo/data/definitions/Etc/GMT__p__1.js"),
  "tzinfo-data2/tzinfo/data/definitions/Etc/UTC": () =>
    import("./tzinfo/data/definitions/Etc/UTC.js"),
  "tzinfo-data2/tzinfo/data/definitions/Europe/Amsterdam": () =>
    import("./tzinfo/data/definitions/Europe/Amsterdam.js"),
  "tzinfo-data2/tzinfo/data/definitions/Europe/Andorra": () =>
    import("./tzinfo/data/definitions/Europe/Andorra.js"),
  "tzinfo-data2/tzinfo/data/definitions/Europe/London": () =>
    import("./tzinfo/data/definitions/Europe/London.js"),
  "tzinfo-data2/tzinfo/data/definitions/Europe/Paris": () =>
    import("./tzinfo/data/definitions/Europe/Paris.js"),
  "tzinfo-data2/tzinfo/data/definitions/Europe/Prague": () =>
    import("./tzinfo/data/definitions/Europe/Prague.js"),
  "tzinfo-data2/tzinfo/data/definitions/Invalid/Incorrect_Module": () =>
    import("./tzinfo/data/definitions/Invalid/Incorrect_Module.js"),
  "tzinfo-data2/tzinfo/data/definitions/UTC": () => import("./tzinfo/data/definitions/UTC.js"),
  "tzinfo-data2/tzinfo/data/indexes/countries": () => import("./tzinfo/data/indexes/countries.js"),
  "tzinfo-data2/tzinfo/data/indexes/timezones": () => import("./tzinfo/data/indexes/timezones.js"),
};
