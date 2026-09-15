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
import {
  assert,
  assertEmpty,
  assertNot,
  assertNotEmpty,
  assertNothingRaised,
} from "./testing/assertions.js";
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

const CamelToUnderscore: Record<string, string> = {
  Product: "product",
  SpecialGuest: "special_guest",
  ApplicationController: "application_controller",
  Area51Controller: "area51_controller",
  AppCDir: "app_c_dir",
  Accountsv2N2Test: "accountsv2_n2_test",
};

const UnderscoreToLowerCamel: Record<string, string> = {
  product: "product",
  special_guest: "specialGuest",
  application_controller: "applicationController",
  area51_controller: "area51Controller",
};

const SymbolToLowerCamel: Record<string, string> = {
  product: "product",
  special_guest: "specialGuest",
  application_controller: "applicationController",
  area51_controller: "area51Controller",
};

const CamelToUnderscoreWithoutReverse: Record<string, string> = {
  HTMLTidy: "html_tidy",
  HTMLTidyGenerator: "html_tidy_generator",
  FreeBSD: "free_bsd",
  HTML: "html",
  ForceXMLController: "force_xml_controller",
  product: "product",
};

const CamelWithModuleToUnderscoreWithSlash: Record<string, string> = {
  "Admin::Product": "admin/product",
  "Users::Commission::Department": "users/commission/department",
  "UsersSection::CommissionDepartment": "users_section/commission_department",
};

const ClassNameToForeignKeyWithUnderscore: Record<string, string> = {
  Person: "person_id",
  "MyApplication::Billing::Account": "account_id",
};

const ClassNameToForeignKeyWithoutUnderscore: Record<string, string> = {
  Person: "personid",
  "MyApplication::Billing::Account": "accountid",
};

const ClassNameToTableName: Record<string, string> = {
  PrimarySpokesman: "primary_spokesmen",
  NodeChild: "node_children",
  Calculu: "calculus",
};

const StringToParameterized: Record<string, string> = {
  "Donald E. Knuth": "donald-e-knuth",
  "Random text with *(bad)* characters": "random-text-with-bad-characters",
  Allow_Under_Scores: "allow_under_scores",
  "Trailing bad characters!@#": "trailing-bad-characters",
  "!@#Leading bad characters": "leading-bad-characters",
  "Squeeze   separators": "squeeze-separators",
  "Test with + sign": "test-with-sign",
};

const StringToParameterizeWithUnderscore: Record<string, string> = {
  "Donald E. Knuth": "donald_e_knuth",
  "Random text with *(bad)* characters": "random_text_with_bad_characters",
  "With-some-dashes": "with-some-dashes",
  Retain_underscore: "retain_underscore",
  "Trailing bad characters!@#": "trailing_bad_characters",
  "!@#Leading bad characters": "leading_bad_characters",
  "Squeeze   separators": "squeeze_separators",
  "Test with + sign": "test_with_sign",
};

const StringToParameterizedAndNormalized: Record<string, string> = {
  Malmö: "malmo",
  Garçons: "garcons",
  OpsÙ: "opsu",
  Ærøskøbing: "aeroskobing",
  Aßlar: "asslar",
  "Japanese: 日本語": "japanese",
};

const UnderscoreToHuman: Record<string, string> = {
  employee_salary: "Employee salary",
  employee_id: "Employee",
  "employee id": "Employee id",
  "employee id etc": "Employee id etc",
  underground: "Underground",
  _id: "Id",
  _external_id: "External",
};

const UnderscoreToHumanWithKeepIdSuffix: Record<string, string> = {
  this_is_a_string_ending_with_id: "This is a string ending with id",
  employee_id: "Employee id",
  employee_id_something_else: "Employee id something else",
  underground: "Underground",
  "employee id": "Employee id",
  "employee id etc": "Employee id etc",
  _id: "Id",
  _external_id: "External id",
};

const UnderscoreToHumanWithoutCapitalize: Record<string, string> = {
  employee_salary: "employee salary",
  employee_id: "employee",
  underground: "underground",
};

const OrdinalNumbers: Record<string, string> = {
  "-1": "-1st",
  "-2": "-2nd",
  "-3": "-3rd",
  "-4": "-4th",
  "-5": "-5th",
  "-6": "-6th",
  "-7": "-7th",
  "-8": "-8th",
  "-9": "-9th",
  "-10": "-10th",
  "-11": "-11th",
  "-12": "-12th",
  "-13": "-13th",
  "-14": "-14th",
  "-20": "-20th",
  "-21": "-21st",
  "-22": "-22nd",
  "-23": "-23rd",
  "-24": "-24th",
  "-100": "-100th",
  "-101": "-101st",
  "-102": "-102nd",
  "-103": "-103rd",
  "-104": "-104th",
  "-110": "-110th",
  "-111": "-111th",
  "-112": "-112th",
  "-113": "-113th",
  "-1000": "-1000th",
  "-1001": "-1001st",
  "0": "0th",
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "5": "5th",
  "6": "6th",
  "7": "7th",
  "8": "8th",
  "9": "9th",
  "10": "10th",
  "11": "11th",
  "12": "12th",
  "13": "13th",
  "14": "14th",
  "20": "20th",
  "21": "21st",
  "22": "22nd",
  "23": "23rd",
  "24": "24th",
  "100": "100th",
  "101": "101st",
  "102": "102nd",
  "103": "103rd",
  "104": "104th",
  "110": "110th",
  "111": "111th",
  "112": "112th",
  "113": "113th",
  "1000": "1000th",
  "1001": "1001st",
};

const UnderscoresToDashes: Record<string, string> = {
  street: "street",
  street_address: "street-address",
  person_street_address: "person-street-address",
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
    expect(pluralize("plurals")).toEqual("plurals");
    expect(pluralize("Plurals")).toEqual("Plurals");
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
    for (const [camel, underscore] of Object.entries(CamelToUnderscore)) {
      expect(camelize(underscore)).toEqual(camel);
    }
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
    expect(camelize("capital", "true" as never)).toEqual("Capital");
    expect(camelize("Capital", "true" as never)).toEqual("Capital");
    expect(camelize("capital", "false" as never)).toEqual("Capital");
    expect(camelize("capital", "foo" as never)).toEqual("Capital");
    expect(camelize("capital", 42 as never)).toEqual("Capital");
    expect(camelize("capital")).toEqual("Capital");
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
        expect(camelize(under)).toEqual(camel);
        expect(camelize(camel)).toEqual(camel);
        assertNot(Object.isFrozen(Object(camelize(under))));
        assertNot(Object.isFrozen(Object(camelize(camel))));
        expect(underscore(under)).toEqual(under);
        expect(underscore(camel)).toEqual(under);
        assertNot(Object.isFrozen(Object(underscore(under))));
        assertNot(Object.isFrozen(Object(underscore(camel))));
        expect(titleize(under)).toEqual(title);
        expect(titleize(camel)).toEqual(title);
        assertNot(Object.isFrozen(Object(titleize(under))));
        assertNot(Object.isFrozen(Object(titleize(camel))));
        expect(humanize(under)).toEqual(human);
        assertNot(Object.isFrozen(Object(humanize(camel))));
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
    for (const [camel, underscore_] of Object.entries(CamelToUnderscore)) {
      expect(underscore(camel)).toEqual(underscore_);
    }
    for (const [camel, underscore_] of Object.entries(CamelToUnderscoreWithoutReverse)) {
      expect(underscore(camel)).toEqual(underscore_);
    }
  });

  it("camelize with module", () => {
    for (const [camel, underscore] of Object.entries(CamelWithModuleToUnderscoreWithSlash)) {
      expect(camelize(underscore)).toEqual(camel);
    }
  });

  it("underscore with slashes", () => {
    for (const [camel, underscore_] of Object.entries(CamelWithModuleToUnderscoreWithSlash)) {
      expect(underscore(camel)).toEqual(underscore_);
    }
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
    for (const [klass, foreignKey_] of Object.entries(ClassNameToForeignKeyWithUnderscore)) {
      expect(foreignKey(klass)).toEqual(foreignKey_);
    }
    for (const [klass, foreignKey_] of Object.entries(ClassNameToForeignKeyWithoutUnderscore)) {
      expect(foreignKey(klass, false)).toEqual(foreignKey_);
    }
  });

  it("tableize", () => {
    for (const [className, tableName] of Object.entries(ClassNameToTableName)) {
      expect(tableize(className)).toEqual(tableName);
    }
  });

  it("parameterize", () => {
    for (const [someString, parameterizedString] of Object.entries(StringToParameterized)) {
      expect(parameterize(someString)).toEqual(parameterizedString);
    }
  });

  it("parameterize and normalize", () => {
    for (const [someString, parameterizedString] of Object.entries(
      StringToParameterizedAndNormalized,
    )) {
      expect(parameterize(someString)).toBe(parameterizedString);
    }
  });

  it("parameterize with custom separator", () => {
    for (const [someString, parameterizedString] of Object.entries(
      StringToParameterizeWithUnderscore,
    )) {
      expect(parameterize(someString, { separator: "_" })).toEqual(parameterizedString);
    }
  });

  it("parameterize with multi character separator", () => {
    for (const [someString, parameterizedString] of Object.entries(StringToParameterized)) {
      expect(parameterize(someString, { separator: "__sep__" })).toEqual(
        parameterizedString.replaceAll("-", "__sep__"),
      );
    }
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

  it("classify with symbol", async () => {
    await assertNothingRaised(() => {
      expect(classify("foo_bars")).toEqual("FooBar");
    });
  });

  it("classify with leading schema name", () => {
    expect(classify("schema.foo_bar")).toBe("FooBar");
  });

  it("humanize", () => {
    for (const [underscore, human] of Object.entries(UnderscoreToHuman)) {
      expect(humanize(underscore)).toEqual(human);
    }
  });

  it("humanize nil", () => {
    expect(humanize("")).toBe("");
  });

  it("humanize without capitalize", () => {
    for (const [underscore, human] of Object.entries(UnderscoreToHumanWithoutCapitalize)) {
      expect(humanize(underscore, { capitalize: false })).toEqual(human);
    }
  });

  it("humanize with keep id suffix", () => {
    for (const [underscore, human] of Object.entries(UnderscoreToHumanWithKeepIdSuffix)) {
      expect(humanize(underscore, { keepIdSuffix: true })).toEqual(human);
    }
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
    for (const [number, ordinalized] of Object.entries(OrdinalNumbers)) {
      expect(number + ordinal(Number(number))).toEqual(ordinalized);
    }
  });

  it("ordinalize", () => {
    for (const [number, ordinalized] of Object.entries(OrdinalNumbers)) {
      expect(ordinalize(Number(number))).toEqual(ordinalized);
    }
  });

  it("dasherize", () => {
    for (const [underscored, dasherized] of Object.entries(UnderscoresToDashes)) {
      expect(dasherize(underscored)).toEqual(dasherized);
    }
  });

  it("underscore as reverse of dasherize", () => {
    for (const underscored of Object.keys(UnderscoresToDashes)) {
      expect(underscore(dasherize(underscored))).toEqual(underscored);
    }
  });

  it("underscore to lower camel", () => {
    for (const [underscored, lowerCamel] of Object.entries(UnderscoreToLowerCamel)) {
      expect(camelize(underscored, false)).toEqual(lowerCamel);
    }
  });

  it("symbol to lower camel", () => {
    for (const [symbol, lowerCamel] of Object.entries(SymbolToLowerCamel)) {
      expect(camelize(symbol, false)).toEqual(lowerCamel);
    }
  });

  it("clear acronyms resets to reusable state", () => {
    withInflections((inflect) => {
      inflect.clear("acronyms");
      assertEmpty(inflect.acronyms);

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

      assertEmpty(inflect.plurals);
      assertEmpty(inflect.singulars);
      assertEmpty(inflect.uncountables);
      assertEmpty(inflect.humans);
      assertEmpty(inflect.acronyms);
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

      assertEmpty(inflect.plurals);
      assertEmpty(inflect.singulars);
      assertEmpty(inflect.uncountables);
      assertEmpty(inflect.humans);
      assertEmpty(inflect.acronyms);
    });
  });

  it("clear all resets camelize and underscore regexes", () => {
    withInflections((inflect) => {
      inflect.acronym("HTTP");
      expect(underscore("HTTPS")).toBe("http_s");
      expect(camelize("https")).toBe("Https");

      inflect.clear("all");

      assertEmpty(inflect.acronyms);
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
    const input = Object.freeze(new String("plurals"));
    assert(Object.isFrozen(input));
    assertNot(Object.isFrozen(Object(pluralize(input.valueOf()))));
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
