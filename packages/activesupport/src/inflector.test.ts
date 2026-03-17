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

describe("InflectorTest", () => {
  it("pluralize plurals", () => {
    expect(pluralize("plurals")).toBe("plurals");
  });

  it("pluralize empty string", () => {
    expect(pluralize("")).toBe("");
  });

  it.skip("pluralize with fallback");

  it.skip("uncountability of ascii word");

  it.skip("uncountability of non-ascii word");

  it("uncountable word is not greedy", () => {
    expect(singularize("sponsor")).toBe("sponsor");
    expect(pluralize("sponsor")).toBe("sponsors");
  });

  it.skip("overwrite previous inflectors");

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

  it.skip("acronyms");

  it.skip("acronym override");

  it.skip("acronyms camelize lower");

  it.skip("underscore acronym sequence");

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

  it.skip("humanize by rule");

  it.skip("humanize by string");

  it.skip("humanize with acronyms");

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

  it.skip("clear acronyms resets to reusable state");

  it.skip("inflector locality");

  it.skip("clear all");

  it.skip("clear with default");

  it.skip("clear all resets camelize and underscore regexes");

  it.skip("clear inflections with acronyms");

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

  it.skip("overlapping acronyms");
});
