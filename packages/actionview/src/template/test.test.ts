import { describe, it } from "vitest";
import { Naming } from "@blazetrails/activemodel";
import { assertEqual, extend } from "@blazetrails/activesupport";
import { Module } from "@blazetrails/ruby-compat";
import { ActionView } from "../namespaces.js";

type DrawSet = { draw(block: (this: { get(path: string, options: object): void }) => void): void };

interface TestCaseHost {
  title(text: string): string;
  homepagePath(): string;
  homepageUrl(): string;
  linkToPerson(person: unknown): string;
  withRouting(block: (set: DrawSet) => Promise<void> | void): Promise<void>;
  contentTag(name: string, content: string): string;
  peoplePath(): string;
  peopleUrl(): string;
  linkTo(name: unknown, options: unknown): string;
  extend(mod: Module): void;
}

type TestCaseClass = {
  new (name: string): TestCaseHost;
  tests(helper: unknown): void;
  helperClass: unknown;
};

const { TestCase } = ActionView as unknown as { TestCase: TestCaseClass };

const PeopleHelper = new Module();
PeopleHelper.defineMethod("title", function (this: TestCaseHost, text: string) {
  return this.contentTag("h1", text);
});
PeopleHelper.defineMethod("homepagePath", function (this: TestCaseHost) {
  return this.peoplePath();
});
PeopleHelper.defineMethod("homepageUrl", function (this: TestCaseHost) {
  return this.peopleUrl();
});
PeopleHelper.defineMethod("linkToPerson", function (this: TestCaseHost, person: { name: string }) {
  return this.linkTo(person.name, person);
});

async function withTestRouteSet(tc: TestCaseHost, block: () => void): Promise<void> {
  await tc.withRouting((set) => {
    set.draw(function () {
      this.get("people", { to: "people#index", as: "people" });
    });
    block();
  });
}

// BLOCKED: port-template-test-case-test
describe("PeopleHelperTest", () => {
  const tc = () => new TestCase("PeopleHelperTest");

  it.skip("title", () => {
    assertEqual("<h1>Ruby on Rails</h1>", tc().title("Ruby on Rails"));
  });

  it.skip("homepage path", async () => {
    const t = tc();
    await withTestRouteSet(t, () => {
      assertEqual("/people", t.homepagePath());
    });
  });

  it.skip("homepage url", async () => {
    const t = tc();
    await withTestRouteSet(t, () => {
      assertEqual("http://test.host/people", t.homepageUrl());
    });
  });

  it.skip("link to person", async () => {
    const t = tc();
    await withTestRouteSet(t, () => {
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
      const mod = new Module();
      mod.defineMethod("minitestMockPath", (model: unknown) => {
        theModel = model;
        return "/people/1";
      });
      t.extend(mod);
      assertEqual('<a href="/people/1">David</a>', t.linkToPerson(person));
      assertEqual(person, theModel);
    });
  });
});

// BLOCKED: port-template-test-case-test
describe("ManuallySetHelperTest", () => {
  it.skip("helper class can be set manually not just inferred", () => {
    class ManuallySetHelperTest extends TestCase {
      static {
        this.tests(PeopleHelper);
      }
    }
    assertEqual(PeopleHelper, ManuallySetHelperTest.helperClass);
  });
});

// BLOCKED: port-template-test-case-test
describe("ManuallySetSymbolHelperTest", () => {
  it.skip("set helper class using symbol", () => {
    class ManuallySetSymbolHelperTest extends TestCase {
      static {
        this.tests(":people");
      }
    }
    assertEqual(PeopleHelper, ManuallySetSymbolHelperTest.helperClass);
  });
});

// BLOCKED: port-template-test-case-test
describe("ManuallySetStringHelperTest", () => {
  it.skip("set helper class using string", () => {
    class ManuallySetStringHelperTest extends TestCase {
      static {
        this.tests("people");
      }
    }
    assertEqual(PeopleHelper, ManuallySetStringHelperTest.helperClass);
  });
});
