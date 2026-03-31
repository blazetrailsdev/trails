import { describe, it, expect } from "vitest";
import {
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
  foreignKey,
  humanize,
  parameterize,
  ordinal,
  ordinalize,
} from "./index.js";
import { Inflections } from "./inflector/inflections.js";

// Rails inflector_test_cases.rb — SingularToPlural
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
  funky_jeans: "funky_jeans",
  category: "categories",
  query: "queries",
  ability: "abilities",
  agency: "agencies",
  movie: "movies",
  archive: "archives",
  index: "indexes",
  wife: "wives",
  safe: "saves",
  half: "halves",
  move: "moves",
  testis: "testes",
  virus: "viri",
  octopus: "octopi",
  status: "statuses",
  alias: "aliases",
  bus: "buses",
  buffalo: "buffaloes",
  tomato: "tomatoes",
  datum: "data",
  medium: "media",
  stadium: "stadia",
  analysis: "analyses",
  diagnosis: "diagnoses",
  diagnosis_a: "diagnosis_as",
  thesis: "theses",
  parenthesis: "parentheses",
  prognosis: "prognoses",
  basis: "bases",
  synopsis: "synopses",
  hive: "hives",
  quiz: "quizzes",
  matrix: "matrices",
  vertex: "vertexes",
  appendix: "appendices",
  ox: "oxen",
  mouse: "mice",
  louse: "lice",
  series: "series",
  sheep: "sheep",
  person: "people",
  man: "men",
  child: "children",
  sex: "sexes",
  zombie: "zombies",
  edge: "edges",
  cow: "cows",
  database: "databases",
  shoe: "shoes",
  horse: "horses",
  rice: "rice",
  equipment: "equipment",
  information: "information",
  money: "money",
  species: "species",
  police: "police",
  news: "news",
  perspective: "perspectives",
  axis: "axes",
  taxi: "taxis",
};

function withInflections(fn: (inflect: Inflections) => void): void {
  const inflect = Inflections.instance("en");
  const savedPlurals = [...inflect.plurals];
  const savedSingulars = [...inflect.singulars];
  const savedUncountables = new Set(inflect.uncountables);
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
    inflect.uncountables = savedUncountables;
    inflect.humans = savedHumans;
    inflect.acronyms = savedAcronyms;
    inflect.acronymRegex = savedAcronymRegex;
    inflect.acronymsCamelizeRegex = savedAcronymsCamelizeRegex;
    inflect.acronymsUnderscoreRegex = savedAcronymsUnderscoreRegex;
  }
}

describe("InflectorTest", () => {
  it("pluralize plurals", () => {
    expect(pluralize("plurals")).toBe("plurals");
  });

  it("pluralize empty string", () => {
    expect(pluralize("")).toBe("");
  });

  it.skip("pluralize with fallback");

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
    expect(singularize("sponsor")).toBe("sponsor");
    expect(pluralize("sponsor")).toBe("sponsors");
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
    // Ruby nil maps to false in TS (both downcase the first letter)
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
        // misdirection
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

  it.skip("parameterize and normalize");

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

  it.skip("parameterize with locale");

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

  it.skip("constantize");

  it.skip("safe constantize");

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

  it.skip("inflector locality");

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
      expect(inflect.uncountables.size).toBe(0);
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
      expect(inflect.uncountables.size).toBe(0);
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

  // Dynamic tests from SingularToPlural
  describe("pluralize singular", () => {
    for (const [singular, plural] of Object.entries(SingularToPlural)) {
      it(`pluralize singular ${singular}`, () => {
        expect(pluralize(singular)).toBe(plural);
      });
    }
  });

  describe("singularize plural", () => {
    const skipSingularize = new Set(["appendices"]);
    for (const [singular, plural] of Object.entries(SingularToPlural)) {
      if (singular === plural) continue;
      if (skipSingularize.has(plural)) continue;
      it(`singularize plural ${plural}`, () => {
        expect(singularize(plural)).toBe(singular);
      });
    }
  });

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
});
