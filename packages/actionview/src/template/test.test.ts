/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, it } from "vitest";
import { Naming } from "@blazetrails/activemodel";
import { assertEqual, extend } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import "../test-helpers/abstract-unit.js";
import { TestCase } from "../test-case.js";

type Tc = Record<string, any>;
type TestCaseClass = typeof TestCase & Record<string, any>;

const PeopleHelper = {
  title(this: Tc, text: string) {
    return this.contentTag("h1", text);
  },

  homepagePath(this: Tc) {
    return this.peoplePath();
  },

  homepageUrl(this: Tc) {
    return this.peopleUrl();
  },

  linkToPerson(this: Tc, person: { name: string }) {
    return this.linkTo(person.name, person);
  },
};
registerConstant("PeopleHelper", PeopleHelper);
registerConstant("Minitest", {});

function testCase(klass: TestCaseClass): () => Tc {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new klass(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
  });
  return () => tc;
}

class PeopleHelperTest extends TestCase {}

describe("PeopleHelperTest", () => {
  const tc = testCase(PeopleHelperTest as TestCaseClass);

  async function withTestRouteSet(block: () => void): Promise<void> {
    await tc().withRouting((set: any) => {
      set.draw(function (this: any) {
        this.get("people", { to: "people#index", as: "people" });
      });
      block();
    });
  }

  it("title", () => {
    assertEqual("<h1>Ruby on Rails</h1>", tc().title("Ruby on Rails"));
  });

  it("homepage path", async () => {
    await withTestRouteSet(() => {
      assertEqual("/people", tc().homepagePath());
    });
  });

  it("homepage url", async () => {
    await withTestRouteSet(() => {
      assertEqual("http://test.host/people", tc().homepageUrl());
    });
  });

  it("link to person", async () => {
    await withTestRouteSet(() => {
      class Person {
        static {
          extend(this, Naming);
        }
        static get name(): string {
          return "Minitest::Mock";
        }
        constructor(public name: string) {}
        toModel(): this {
          return this;
        }
        isPersisted(): boolean {
          return true;
        }
      }
      const person = new Person("David");

      let theModel: unknown = null;
      extend(tc(), {
        minitestMockPath(model: unknown, ..._args: unknown[]) {
          theModel = model;
          return "/people/1";
        },
      });
      assertEqual('<a href="/people/1">David</a>', tc().linkToPerson(person));
      assertEqual(person, theModel);
    });
  });
});

class ManuallySetHelperTest extends TestCase {}
(ManuallySetHelperTest as TestCaseClass).tests(PeopleHelper);

describe("ManuallySetHelperTest", () => {
  it("helper class can be set manually not just inferred", () => {
    assertEqual(PeopleHelper, (ManuallySetHelperTest as TestCaseClass).helperClass);
  });
});

class ManuallySetSymbolHelperTest extends TestCase {}
(ManuallySetSymbolHelperTest as TestCaseClass).tests(":people");

describe("ManuallySetSymbolHelperTest", () => {
  it("set helper class using symbol", () => {
    assertEqual(PeopleHelper, (ManuallySetSymbolHelperTest as TestCaseClass).helperClass);
  });
});

class ManuallySetStringHelperTest extends TestCase {}
(ManuallySetStringHelperTest as TestCaseClass).tests("people");

describe("ManuallySetStringHelperTest", () => {
  it("set helper class using string", () => {
    assertEqual(PeopleHelper, (ManuallySetStringHelperTest as TestCaseClass).helperClass);
  });
});
