import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import {
  constRegexp,
  pluralize,
  singularize,
  camelize,
  underscore,
  titleize,
  tableize,
  classify,
  dasherize,
  demodulize,
  deconstantize,
  constantize,
  safeConstantize,
  _resetConstants,
  foreignKey,
  humanize,
  parameterize,
  ordinal,
  ordinalize,
} from "./index.js";
import { Inflections, Uncountables, inflections } from "./inflector/inflections.js";
import { I18n } from "./i18n.js";
import { assertEmpty, assertNotEmpty } from "./testing/assertions.js";
import {
  registerConstantizeFixtures,
  runConstantizeTestsOn,
  runSafeConstantizeTestsOn,
} from "./constantize-test-cases.js";

const SingularToPlural: Record<string, string> = {
  search: "searches",
  switch: "switches",
  fix: "fixes",
  box: "boxes",
  process: "processes",
  address: "addresses",
  case: "cases",
  stack: "stacks",
  wish: "wishes",
  fish: "fish",
  jeans: "jeans",
  "funky jeans": "funky jeans",
  "my money": "my money",

  category: "categories",
  query: "queries",
  ability: "abilities",
  agency: "agencies",
  movie: "movies",

  archive: "archives",

  index: "indices",

  wife: "wives",
  safe: "saves",
  half: "halves",

  move: "moves",

  salesperson: "salespeople",
  person: "people",

  spokesman: "spokesmen",
  man: "men",
  woman: "women",

  basis: "bases",
  diagnosis: "diagnoses",
  diagnosis_a: "diagnosis_as",

  datum: "data",
  medium: "media",
  stadium: "stadia",
  analysis: "analyses",
  my_analysis: "my_analyses",

  node_child: "node_children",
  child: "children",

  experience: "experiences",
  day: "days",

  comment: "comments",
  foobar: "foobars",
  newsletter: "newsletters",

  old_news: "old_news",
  news: "news",

  series: "series",
  miniseries: "miniseries",
  species: "species",

  quiz: "quizzes",

  perspective: "perspectives",

  ox: "oxen",
  photo: "photos",
  buffalo: "buffaloes",
  tomato: "tomatoes",
  dwarf: "dwarves",
  elf: "elves",
  information: "information",
  equipment: "equipment",
  bus: "buses",
  status: "statuses",
  status_code: "status_codes",
  mouse: "mice",

  louse: "lice",
  house: "houses",
  octopus: "octopi",
  virus: "viri",
  alias: "aliases",
  portfolio: "portfolios",

  vertex: "vertices",
  matrix: "matrices",
  matrix_fu: "matrix_fus",

  axis: "axes",
  taxi: "taxis",
  testis: "testes",
  crisis: "crises",

  rice: "rice",
  shoe: "shoes",

  horse: "horses",
  prize: "prizes",
  edge: "edges",

  database: "databases",

  "|ice": "|ices",
  "|ouse": "|ouses",
  slice: "slices",
  police: "police",
};

const StringToParameterizedAndNormalized: Record<string, string> = {
  Malmö: "malmo",
  Garçons: "garcons",
  OpsÙ: "opsu",
  Ærøskøbing: "aeroskobing",
  Aßlar: "asslar",
  "Japanese: 日本語": "japanese",
};

function withInflections(fn: (inflect: Inflections) => void): void {
  const inflect = Inflections.instance("en");
  const savedPlurals = [...inflect.plurals];
  const savedSingulars = [...inflect.singulars];
  const savedUncountables = [...inflect.uncountables];
  const savedHumans = [...inflect.humans];
  const savedAcronyms = new Map(inflect.acronyms);
  const savedAcronymRegex = inflect.acronymRegex;
  const savedAcronymsCamelizeRegex = inflect.acronymsCamelizeRegex;
  const savedAcronymsUnderscoreRegex = inflect.acronymsUnderscoreRegex;
  try {
    fn(inflect);
  } finally {
    inflect.plurals = savedPlurals;
    inflect.singulars = savedSingulars;
    inflect.uncountables = new Uncountables().add(savedUncountables);
    inflect.humans = savedHumans;
    inflect.acronyms = savedAcronyms;
    inflect.acronymRegex = savedAcronymRegex;
    inflect.acronymsCamelizeRegex = savedAcronymsCamelizeRegex;
    inflect.acronymsUnderscoreRegex = savedAcronymsUnderscoreRegex;
  }
}

describe("InflectorTest", () => {
  let enforceAvailableLocales: boolean;
  beforeAll(() => {
    enforceAvailableLocales = I18n.config().enforceAvailableLocales;
    I18n.config().enforceAvailableLocales = false;
  });
  afterAll(() => {
    I18n.config().enforceAvailableLocales = enforceAvailableLocales;
  });

  beforeEach(() => {
    _resetConstants();
    registerConstantizeFixtures();
  });

  it("constantize", () => {
    runConstantizeTestsOn((string) => constantize(string));
  });

  it("safe constantize", () => {
    runSafeConstantizeTestsOn((string) => safeConstantize(string));
  });

  it("pluralize plurals", () => {
    expect(pluralize("plurals")).toBe("plurals");
  });

  it("pluralize empty string", () => {
    expect(pluralize("")).toBe("");
  });

  it("pluralize with fallback", () => {
    const defaultLocale = I18n.defaultLocale();
    I18n.setDefaultLocale("en-GB");
    try {
      expect(pluralize("day")).toBe("days");
    } finally {
      I18n.setDefaultLocale(defaultLocale);
    }
  });

  it("uncountability of ascii word", () => {
    withInflections((inflect) => {
      inflect.uncountable("HTTP");
      expect(pluralize("HTTP")).toBe("HTTP");
      expect(singularize("HTTP")).toBe("HTTP");
      expect(pluralize("HTTP")).toBe(singularize("HTTP"));
    });
  });

  it("uncountability of non-ascii word", () => {
    withInflections((inflect) => {
      inflect.uncountable("猫");
      expect(pluralize("猫")).toBe("猫");
      expect(singularize("猫")).toBe("猫");
      expect(pluralize("猫")).toBe(singularize("猫"));
    });
  });

  it("uncountable word is not greedy", () => {
    withInflections((inflect) => {
      const uncountableWord = "ors";
      const countableWord = "sponsor";

      inflect.uncountable(uncountableWord);

      expect(singularize(uncountableWord)).toBe(uncountableWord);
      expect(pluralize(uncountableWord)).toBe(uncountableWord);
      expect(pluralize(uncountableWord)).toBe(singularize(uncountableWord));

      expect(singularize(countableWord)).toBe("sponsor");
      expect(pluralize(countableWord)).toBe("sponsors");
      expect(singularize(pluralize(countableWord))).toBe("sponsor");
    });
  });

  it("overwrite previous inflectors", () => {
    withInflections((inflect) => {
      expect(singularize("series")).toBe("series");
      inflect.singular("series", "serie");
      expect(singularize("series")).toBe("serie");
    });
  });

  it("camelize", () => {
    expect(camelize("product")).toBe("Product");
    expect(camelize("special_guest")).toBe("SpecialGuest");
    expect(camelize("application_controller")).toBe("ApplicationController");
    expect(camelize("area51_controller")).toBe("Area51Controller");
  });

  it("camelize with true upcases the first letter", () => {
    expect(camelize("Capital", true)).toBe("Capital");
    expect(camelize("capital", true)).toBe("Capital");
  });

  it("camelize with upper upcases the first letter", () => {
    expect(camelize("Capital", "upper")).toBe("Capital");
    expect(camelize("capital", "upper")).toBe("Capital");
  });

  it("camelize with false downcases the first letter", () => {
    expect(camelize("Capital", false)).toBe("capital");
    expect(camelize("capital", false)).toBe("capital");
  });

  it("camelize with nil downcases the first letter", () => {
    expect(camelize("Capital", null as unknown as boolean)).toBe("capital");
    expect(camelize("capital", null as unknown as boolean)).toBe("capital");
  });

  it("camelize with lower downcases the first letter", () => {
    expect(camelize("Capital", "lower")).toBe("capital");
    expect(camelize("capital", "lower")).toBe("capital");
  });

  it("camelize with any other arg upcases the first letter", () => {
    expect(camelize("Capital", true)).toBe("Capital");
    expect(camelize("capital", true)).toBe("Capital");
  });

  it("camelize with underscores", () => {
    expect(camelize("Camel_Case")).toBe("CamelCase");
  });

  it("acronyms", () => {
    withInflections((inflect) => {
      inflect.acronym("API");
      inflect.acronym("HTML");
      inflect.acronym("HTTP");
      inflect.acronym("RESTful");
      inflect.acronym("W3C");
      inflect.acronym("PhD");
      inflect.acronym("RoR");
      inflect.acronym("SSL");

      const cases: [string, string, string, string][] = [
        ["API", "api", "API", "API"],
        ["APIController", "api_controller", "API controller", "API Controller"],
        ["Nokogiri::HTML", "nokogiri/html", "Nokogiri/HTML", "Nokogiri/HTML"],
        ["HTTPAPI", "http_api", "HTTP API", "HTTP API"],
        ["HTTP::Get", "http/get", "HTTP/get", "HTTP/Get"],
        ["SSLError", "ssl_error", "SSL error", "SSL Error"],
        ["RESTful", "restful", "RESTful", "RESTful"],
        ["RESTfulController", "restful_controller", "RESTful controller", "RESTful Controller"],
        ["Nested::RESTful", "nested/restful", "Nested/RESTful", "Nested/RESTful"],
        ["IHeartW3C", "i_heart_w3c", "I heart W3C", "I Heart W3C"],
        ["PhDRequired", "phd_required", "PhD required", "PhD Required"],
        ["IRoRU", "i_ror_u", "I RoR u", "I RoR U"],
        ["RESTfulHTTPAPI", "restful_http_api", "RESTful HTTP API", "RESTful HTTP API"],
        ["HTTP::RESTful", "http/restful", "HTTP/RESTful", "HTTP/RESTful"],
        ["HTTP::RESTfulAPI", "http/restful_api", "HTTP/RESTful API", "HTTP/RESTful API"],
        ["APIRESTful", "api_restful", "API RESTful", "API RESTful"],
        ["Capistrano", "capistrano", "Capistrano", "Capistrano"],
        ["CapiController", "capi_controller", "Capi controller", "Capi Controller"],
        ["HttpsApis", "https_apis", "Https apis", "Https Apis"],
        ["Html5", "html5", "Html5", "Html5"],
        ["Restfully", "restfully", "Restfully", "Restfully"],
        ["RoRails", "ro_rails", "Ro rails", "Ro Rails"],
      ];

      for (const [camel, under, human, title] of cases) {
        expect(camelize(under)).toBe(camel);
        expect(camelize(camel)).toBe(camel);
        expect(underscore(under)).toBe(under);
        expect(underscore(camel)).toBe(under);
        expect(titleize(under)).toBe(title);
        expect(titleize(camel)).toBe(title);
        expect(humanize(under)).toBe(human);
      }
    });
  });

  it("acronym override", () => {
    withInflections((inflect) => {
      inflect.acronym("API");
      inflect.acronym("LegacyApi");

      expect(camelize("legacyapi")).toBe("LegacyApi");
      expect(camelize("legacy_api")).toBe("LegacyAPI");
      expect(camelize("some_legacyapi")).toBe("SomeLegacyApi");
      expect(camelize("nonlegacyapi")).toBe("Nonlegacyapi");
    });
  });

  it("acronyms camelize lower", () => {
    withInflections((inflect) => {
      inflect.acronym("API");
      inflect.acronym("HTML");

      expect(camelize("html_api", false)).toBe("htmlAPI");
      expect(camelize("htmlAPI", false)).toBe("htmlAPI");
      expect(camelize("HTMLAPI", false)).toBe("htmlAPI");
    });
  });

  it("underscore acronym sequence", () => {
    withInflections((inflect) => {
      inflect.acronym("API");
      inflect.acronym("JSON");
      inflect.acronym("HTML");

      expect(underscore("JSONHTMLAPI")).toBe("json_html_api");
    });
  });

  it("underscore", () => {
    expect(underscore("HTMLTidy")).toBe("html_tidy");
    expect(underscore("HTMLTidyGenerator")).toBe("html_tidy_generator");
    expect(underscore("FreeBSD")).toBe("free_bsd");
    expect(underscore("HTML")).toBe("html");
    expect(underscore("ForceXMLController")).toBe("force_xml_controller");
  });

  it("camelize with module", () => {
    expect(camelize("admin/product")).toBe("Admin::Product");
    expect(camelize("users/commission/department")).toBe("Users::Commission::Department");
  });

  it("underscore with slashes", () => {
    expect(underscore("Admin::Product")).toBe("admin/product");
    expect(underscore("Users::Commission::Department")).toBe("users/commission/department");
    expect(underscore("UsersSection::CommissionDepartment")).toBe(
      "users_section/commission_department",
    );
  });

  it("demodulize", () => {
    expect(demodulize("MyApplication::Billing::Account")).toBe("Account");
    expect(demodulize("Account")).toBe("Account");
    expect(demodulize("::Account")).toBe("Account");
    expect(demodulize("")).toBe("");
  });

  it("deconstantize", () => {
    expect(deconstantize("MyApplication::Billing::Account")).toBe("MyApplication::Billing");
    expect(deconstantize("::MyApplication::Billing::Account")).toBe("::MyApplication::Billing");
    expect(deconstantize("MyApplication::Billing")).toBe("MyApplication");
    expect(deconstantize("::MyApplication::Billing")).toBe("::MyApplication");
    expect(deconstantize("Account")).toBe("");
    expect(deconstantize("::Account")).toBe("");
    expect(deconstantize("")).toBe("");
  });

  it("foreign key", () => {
    expect(foreignKey("Person")).toBe("person_id");
    expect(foreignKey("MyApplication::Billing::Account")).toBe("account_id");
    expect(foreignKey("Person", false)).toBe("personid");
    expect(foreignKey("MyApplication::Billing::Account", false)).toBe("accountid");
  });

  it("tableize", () => {
    expect(tableize("PrimarySpokesman")).toBe("primary_spokesmen");
    expect(tableize("NodeChild")).toBe("node_children");
  });

  it("parameterize", () => {
    expect(parameterize("Random text with *(bad)* characters")).toBe(
      "random-text-with-bad-characters",
    );
    expect(parameterize("Allow_Under_Scores")).toBe("allow_under_scores");
    expect(parameterize("Trailing bad characters!@#")).toBe("trailing-bad-characters");
    expect(parameterize("!@#Leading bad characters")).toBe("leading-bad-characters");
    expect(parameterize("Squeeze   separators")).toBe("squeeze-separators");
    expect(parameterize("Test with + sign")).toBe("test-with-sign");
  });

  it("parameterize and normalize", () => {
    for (const [someString, parameterizedString] of Object.entries(
      StringToParameterizedAndNormalized,
    )) {
      expect(parameterize(someString)).toBe(parameterizedString);
    }
  });

  it("parameterize with custom separator", () => {
    expect(parameterize("Donald E. Knuth", { separator: "_" })).toBe("donald_e_knuth");
    expect(parameterize("Random text with *(bad)* characters", { separator: "_" })).toBe(
      "random_text_with_bad_characters",
    );
    expect(parameterize("Trailing bad characters!@#", { separator: "_" })).toBe(
      "trailing_bad_characters",
    );
    expect(parameterize("Squeeze   separators", { separator: "_" })).toBe("squeeze_separators");
  });

  it("parameterize with multi character separator", () => {
    expect(parameterize("Donald E. Knuth", { separator: "__sep__" })).toBe(
      "donald__sep__e__sep__knuth",
    );
    expect(parameterize("Random text with *(bad)* characters", { separator: "__sep__" })).toBe(
      "random__sep__text__sep__with__sep__bad__sep__characters",
    );
  });

  it("parameterize with locale", () => {
    const word = "Fünf autos";
    I18n.backend().storeTranslations("de", { i18n: { transliterate: { rule: { ü: "ue" } } } });
    expect(parameterize(word, { locale: "de" })).toBe("fuenf-autos");
  });

  it("classify", () => {
    expect(classify("primary_spokesmen")).toBe("PrimarySpokesman");
    expect(classify("node_children")).toBe("NodeChild");
  });

  it("classify with symbol", () => {
    expect(classify("foo_bars")).toBe("FooBar");
  });

  it("classify with leading schema name", () => {
    expect(classify("schema.foo_bar")).toBe("FooBar");
  });

  it("humanize", () => {
    expect(humanize("employee_salary")).toBe("Employee salary");
    expect(humanize("employee_id")).toBe("Employee");
    expect(humanize("underground")).toBe("Underground");
    expect(humanize("author_id")).toBe("Author");
  });

  it("humanize nil", () => {
    expect(humanize("")).toBe("");
  });

  it("humanize without capitalize", () => {
    expect(humanize("employee_salary", { capitalize: false })).toBe("employee salary");
    expect(humanize("employee_id", { capitalize: false })).toBe("employee");
    expect(humanize("underground", { capitalize: false })).toBe("underground");
  });

  it("humanize with keep id suffix", () => {
    expect(humanize("employee_id", { keepIdSuffix: true })).toBe("Employee id");
    expect(humanize("author_id", { keepIdSuffix: true })).toBe("Author id");
  });

  it("humanize by rule", () => {
    withInflections((inflect) => {
      inflect.human(/_cnt$/i, "_count");
      inflect.human(/^prefx_/i, "");
      expect(humanize("jargon_cnt")).toBe("Jargon count");
      expect(humanize("prefx_request")).toBe("Request");
    });
  });

  it("humanize by string", () => {
    withInflections((inflect) => {
      inflect.human("col_rpted_bugs", "Reported bugs");
      expect(humanize("col_rpted_bugs")).toBe("Reported bugs");
      expect(humanize("COL_rpted_bugs")).toBe("Col rpted bugs");
    });
  });

  it("humanize with acronyms", () => {
    withInflections((inflect) => {
      inflect.acronym("LAX");
      inflect.acronym("SFO");
      expect(humanize("LAX ROUNDTRIP TO SFO")).toBe("LAX roundtrip to SFO");
      expect(humanize("LAX ROUNDTRIP TO SFO", { capitalize: false })).toBe("LAX roundtrip to SFO");
      expect(humanize("lax roundtrip to sfo")).toBe("LAX roundtrip to SFO");
      expect(humanize("lax roundtrip to sfo", { capitalize: false })).toBe("LAX roundtrip to SFO");
      expect(humanize("Lax Roundtrip To Sfo")).toBe("LAX roundtrip to SFO");
      expect(humanize("Lax Roundtrip To Sfo", { capitalize: false })).toBe("LAX roundtrip to SFO");
    });
  });

  it("ordinal", () => {
    expect(ordinal(0)).toBe("th");
    expect(ordinal(1)).toBe("st");
    expect(ordinal(2)).toBe("nd");
    expect(ordinal(3)).toBe("rd");
    expect(ordinal(4)).toBe("th");
    expect(ordinal(5)).toBe("th");
    expect(ordinal(10)).toBe("th");
    expect(ordinal(11)).toBe("th");
    expect(ordinal(12)).toBe("th");
    expect(ordinal(13)).toBe("th");
    expect(ordinal(14)).toBe("th");
    expect(ordinal(20)).toBe("th");
    expect(ordinal(21)).toBe("st");
    expect(ordinal(100)).toBe("th");
    expect(ordinal(101)).toBe("st");
    expect(ordinal(102)).toBe("nd");
    expect(ordinal(103)).toBe("rd");
    expect(ordinal(1000)).toBe("th");
  });

  it("ordinalize", () => {
    expect(ordinalize(0)).toBe("0th");
    expect(ordinalize(1)).toBe("1st");
    expect(ordinalize(2)).toBe("2nd");
    expect(ordinalize(3)).toBe("3rd");
    expect(ordinalize(11)).toBe("11th");
    expect(ordinalize(12)).toBe("12th");
    expect(ordinalize(13)).toBe("13th");
    expect(ordinalize(21)).toBe("21st");
    expect(ordinalize(100)).toBe("100th");
    expect(ordinalize(101)).toBe("101st");
    expect(ordinalize(102)).toBe("102nd");
    expect(ordinalize(103)).toBe("103rd");
    expect(ordinalize(1001)).toBe("1001st");
  });

  it("dasherize", () => {
    expect(dasherize("street")).toBe("street");
    expect(dasherize("street_address")).toBe("street-address");
    expect(dasherize("person_street_address")).toBe("person-street-address");
  });

  it("underscore as reverse of dasherize", () => {
    expect(underscore(dasherize("street"))).toBe("street");
    expect(underscore(dasherize("street_address"))).toBe("street_address");
    expect(underscore(dasherize("person_street_address"))).toBe("person_street_address");
  });

  it("underscore to lower camel", () => {
    expect(camelize("product", false)).toBe("product");
    expect(camelize("special_guest", false)).toBe("specialGuest");
    expect(camelize("application_controller", false)).toBe("applicationController");
    expect(camelize("area51_controller", false)).toBe("area51Controller");
  });

  it("symbol to lower camel", () => {
    expect(camelize("html_parser", false)).toBe("htmlParser");
  });

  it("clear acronyms resets to reusable state", () => {
    withInflections((inflect) => {
      inflect.clear("acronyms");
      expect(inflect.acronyms.size).toBe(0);

      inflect.acronym("HTML");
      expect(titleize("html")).toBe("HTML");
    });
  });

  it("inflector locality", () => {
    inflections("es", (inflect) => {
      inflect.plural(/$/, "s");
      inflect.plural(/z$/i, "ces");

      inflect.singular(/s$/, "");
      inflect.singular(/es$/, "");

      inflect.irregular("el", "los");

      inflect.uncountable("agua");
    });

    expect(pluralize("hijo", "es")).toBe("hijos");
    expect(pluralize("luz", "es")).toBe("luces");
    expect(pluralize("luz")).toBe("luzs");

    expect(singularize("sociedades", "es")).toBe("sociedad");
    expect(singularize("sociedades")).toBe("sociedade");

    expect(pluralize("el", "es")).toBe("los");
    expect(pluralize("el")).toBe("els");

    expect(pluralize("agua", "es")).toBe("agua");
    expect(pluralize("agua")).toBe("aguas");

    inflections("es", (inflect) => inflect.clear());

    assertEmpty(inflections("es").plurals);
    assertEmpty(inflections("es").singulars);
    assertEmpty(inflections("es").uncountables);
    assertNotEmpty(inflections().plurals);
    assertNotEmpty(inflections().singulars);
    assertNotEmpty(inflections().uncountables);
  });

  it("clear all", () => {
    withInflections((inflect) => {
      inflect.plural(/(quiz)$/i, "$1zes");
      inflect.singular(/(database)s$/i, "$1");
      inflect.uncountable("series");
      inflect.human("col_rpted_bugs", "Reported bugs");
      inflect.acronym("HTML");

      inflect.clear("all");

      expect(inflect.plurals).toEqual([]);
      expect(inflect.singulars).toEqual([]);
      expect(inflect.uncountables.length).toBe(0);
      expect(inflect.humans).toEqual([]);
      expect(inflect.acronyms.size).toBe(0);
    });
  });

  it("clear with default", () => {
    withInflections((inflect) => {
      inflect.plural(/(quiz)$/i, "$1zes");
      inflect.singular(/(database)s$/i, "$1");
      inflect.uncountable("series");
      inflect.human("col_rpted_bugs", "Reported bugs");
      inflect.acronym("HTML");

      inflect.clear();

      expect(inflect.plurals).toEqual([]);
      expect(inflect.singulars).toEqual([]);
      expect(inflect.uncountables.length).toBe(0);
      expect(inflect.humans).toEqual([]);
      expect(inflect.acronyms.size).toBe(0);
    });
  });

  it("clear all resets camelize and underscore regexes", () => {
    withInflections((inflect) => {
      inflect.acronym("HTTP");
      expect(underscore("HTTPS")).toBe("http_s");
      expect(camelize("https")).toBe("Https");

      inflect.clear("all");

      expect(inflect.acronyms.size).toBe(0);
      expect(underscore("HTTPS")).toBe("https");
      expect(camelize("https")).toBe("Https");
    });
  });

  it("clear inflections with acronyms", () => {
    withInflections((inflect) => {
      inflect.clear("acronyms");
      expect(inflect.acronyms.size).toBe(0);
    });
  });

  it("output is not frozen even if input is frozen", () => {
    const input = "word";
    const result = pluralize(input);
    expect(result).toBe("words");
  });

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  for (const [singular, plural] of Object.entries(SingularToPlural)) {
    it(`pluralize singular ${singular}`, () => {
      expect(pluralize(singular)).toBe(plural);
      expect(pluralize(capitalize(singular))).toBe(capitalize(plural));
    });
  }

  for (const [singular, plural] of Object.entries(SingularToPlural)) {
    it(`singularize plural ${plural}`, () => {
      expect(singularize(plural)).toBe(singular);
      expect(singularize(capitalize(plural))).toBe(capitalize(singular));
    });
  }

  for (const [singular, plural] of Object.entries(SingularToPlural)) {
    it(`pluralize plural ${plural}`, () => {
      expect(pluralize(plural)).toBe(plural);
      expect(pluralize(capitalize(plural))).toBe(capitalize(plural));
    });

    it(`singularize singular ${singular}`, () => {
      expect(singularize(singular)).toBe(singular);
      expect(singularize(capitalize(singular))).toBe(capitalize(singular));
    });
  }

  describe("titleize", () => {
    it("titleize mixture to title case", () => {
      expect(titleize("active_record")).toBe("Active Record");
      expect(titleize("ActiveRecord")).toBe("Active Record");
      expect(titleize("action web service")).toBe("Action Web Service");
      expect(titleize("Action Web Service")).toBe("Action Web Service");
      expect(titleize("actionwebservice")).toBe("Actionwebservice");
    });
  });

  it("humanize with international characters", () => {
    expect(humanize("é_employee")).toBe("É employee");
    expect(humanize("ü_user")).toBe("Ü user");
  });

  it("const regexp", () => {
    expect(constRegexp("Foo::Bar::Baz")).toBe("Foo(::Bar(::Baz)?)?");
    expect(constRegexp("::")).toBe("::");
    expect(constRegexp("Foo")).toBe("Foo");
  });
});
