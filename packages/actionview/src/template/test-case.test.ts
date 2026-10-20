/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, it } from "vitest";
import { ActionController, ActionDispatch } from "@blazetrails/actionpack";
import {
  assert,
  assertCalledWith,
  assertEqual,
  assertIncludes,
  assertKindOf,
  assertMatch,
  assertNil,
  assertNot,
  assertNotIncludes,
  assertNotRespondTo,
  assertRaise,
  assertSame,
  HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { HTML5 } from "@blazetrails/nokogiri";
import {
  NoMethodError,
  rbCString,
  rbFSend,
  rbModAncestors,
  rbModConstSet,
  rbObjSingletonClass,
} from "@blazetrails/ruby-compat";
import "../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { DetailsKey } from "../lookup-context.js";
import { ActionView } from "../namespaces.js";
import { INTERNAL_IVARS, TestCase } from "../test-case.js";

type Tc = Record<string, any>;
type TestCaseClass = typeof TestCase & Record<string, any>;

const ATestHelper: Record<string, unknown> = {};
rbModConstSet(ActionView, "ATestHelper", ATestHelper);

const AnotherTestHelper = {
  fromAnotherHelper() {
    return "Howdy!";
  },
};

const ASharedTestHelper = {
  fromSharedHelper() {
    return "Holla!";
  },
};

(TestCase as TestCaseClass).helper(ASharedTestHelper);

class DeveloperStruct {
  constructor(public name: string) {}
}

function named<T extends object>(klass: T, name: string, namespace: object = ActionView): T {
  rbModConstSet(namespace, name, klass);
  Object.defineProperty(klass, "name", {
    value: `${(namespace as { name: string }).name}::${name}`,
  });
  return klass;
}

function sharedTestsSetup(this: Tc): void {
  DetailsKey.clear();
}

function testCase(klass: TestCaseClass, setup?: (this: Tc) => void): () => Tc {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new klass(task.name) as unknown as Tc;
    setup?.call(tc);
    await tc.beforeSetup();
    tc.setup();
  });
  return () => tc;
}

const GeneralViewTest = named(class GeneralViewTest extends TestCase {}, "GeneralViewTest");
(GeneralViewTest as TestCaseClass).helper(AnotherTestHelper);

describe("TestCase", () => {
  const testCase_ = GeneralViewTest as TestCaseClass;
  const tc = testCase(testCase_, sharedTestsSetup);

  it("helpers defined on ActionView::TestCase are available", () => {
    assertIncludes(rbModAncestors(testCase_), ASharedTestHelper);
    assertEqual("Holla!", tc().fromSharedHelper());
  });
});

describe("GeneralViewTest", () => {
  const testCase_ = GeneralViewTest as TestCaseClass;
  const tc = testCase(testCase_, sharedTestsSetup);

  it("memoizes the view", () => {
    assertSame(tc().view(), tc().view());
  });

  it("exposes params", () => {
    assert(tc().params() instanceof ActionController.Parameters);
  });

  it("exposes request", () => {
    assert(tc().request instanceof ActionDispatch.Request);
  });

  it("exposes view as _view for backwards compatibility", () => {
    assertSame(tc()._view(), tc().view());
  });

  it("returns controller_name", () => {
    assertEqual("test", tc().controllerName());
  });

  it("retrieve non existing config values", () => {
    assertNil((Base.empty().config as Record<string, unknown>)["somethingOdd"]);
  });

  it("works without testing a helper module", async () => {
    assertEqual(
      "Eloy",
      String(await tc().render("developers/developer", { developer: new DeveloperStruct("Eloy") })),
    );
  });

  it("can render a layout with block", async () => {
    assertEqual(
      "Before (ChrisCruft)\n!\nAfter",
      String(
        await tc().render(
          { layout: "test/layout_for_partial", locals: { name: "ChrisCruft" } },
          {},
          () => "!",
        ),
      ),
    );
  });

  it("additional helper classes can be specified as in a controller", () => {
    assertIncludes(rbModAncestors(testCase_), AnotherTestHelper);
    assertEqual("Howdy!", tc().fromAnotherHelper());
  });

  it("determine_default_helper_class returns nil if the test name constant resolves to a class", () => {
    assertNil(testCase_.determineDefaultHelperClass("String"));
  });

  it("delegates notice to request.flash[:notice]", async () => {
    await assertCalledWith(tc().view().request.flash, "get", ["notice"], {}, () => {
      void tc().view().notice;
    });
  });

  it("delegates alert to request.flash[:alert]", async () => {
    await assertCalledWith(tc().view().request.flash, "get", ["alert"], {}, () => {
      void tc().view().alert;
    });
  });

  it("uses controller lookup context", () => {
    assertEqual(tc().lookupContext, tc().controller.lookupContext);
  });
});

const ClassMethodsTest = named(class ClassMethodsTest extends TestCase {}, "ClassMethodsTest");
(ClassMethodsTest as TestCaseClass).tests(ATestHelper);
(ClassMethodsTest as TestCaseClass).helper(AnotherTestHelper);

describe("ClassMethodsTest", () => {
  const testCase_ = ClassMethodsTest as TestCaseClass;
  const tc = testCase(testCase_, sharedTestsSetup);

  it("tests the specified helper module", () => {
    assertEqual(ATestHelper, testCase_.helperClass);
    assertIncludes(rbModAncestors(testCase_), ATestHelper);
  });

  it("additional helper classes can be specified as in a controller", async () => {
    assertIncludes(rbModAncestors(testCase_), AnotherTestHelper);
    assertEqual("Howdy!", tc().fromAnotherHelper());

    testCase_.helperClass.renderFromHelper = function (this: Tc) {
      return this.fromAnotherHelper();
    };
    assertEqual("Howdy!", String(await tc().render({ partial: "test/from_helper" })));
  });
});

const RenderHelper = {
  renderFromHelper(this: Tc) {
    return this.render({ partial: "customer", collection: this.customers });
  },
};

const HelperInclusionTest = named(
  class HelperInclusionTest extends TestCase {
    teardown(): void {
      for (const path of ActionController.Base.viewPaths()) path.clearCache!();
    }
  },
  "HelperInclusionTest",
);
(HelperInclusionTest as TestCaseClass).helper(RenderHelper);

describe("HelperInclusionTest", () => {
  const tc = testCase(HelperInclusionTest as TestCaseClass);

  it("helper class that is being tested is always included in view instance", async () => {
    tc().controller.setControllerPath("test");

    tc().customers = [new DeveloperStruct("Eloy"), new DeveloperStruct("Manfred")];
    assertMatch(
      /Hello: EloyHello: Manfred/,
      String(await tc().render({ partial: "test/from_helper" })),
    );
  });
});

const SomeHelper = {
  someMethod(this: Tc) {
    return this.render({ partial: "test/from_helper" });
  },
};

const ControllerHelperMethod = named(
  class ControllerHelperMethod extends TestCase {},
  "ControllerHelperMethod",
);
(ControllerHelperMethod as TestCaseClass).helper(SomeHelper);

describe("ControllerHelperMethod", () => {
  const tc = testCase(ControllerHelperMethod as TestCaseClass);

  it("can call a helper method defined on the current controller from a helper", async () => {
    rbObjSingletonClass(tc().controller).prototype.renderFromHelper = function () {
      return "controller_helper_method";
    };
    (tc().controller.constructor as TestCaseClass).helperMethod("renderFromHelper");

    assertEqual("controller_helper_method", String(await tc().someMethod()));
  });

  describe("AnotherTestClass", () => {
    const AnotherTestClass = named(
      class AnotherTestClass extends TestCase {},
      "AnotherTestClass",
      ControllerHelperMethod,
    );
    const tc = testCase(AnotherTestClass as TestCaseClass);

    it("doesn't use controller helpers from other tests", () => {
      assertNotRespondTo(tc().view(), "renderFromHelper");
      assertNotIncludes(Object.keys(tc().controller._helpers), "renderFromHelper");
    });
  });
});

const ViewAssignsTest = named(class ViewAssignsTest extends TestCase {}, "ViewAssignsTest");

describe("ViewAssignsTest", () => {
  const tc = testCase(ViewAssignsTest as TestCaseClass);

  it("view_assigns returns a Hash of user defined ivars", () => {
    tc().a = "b";
    tc().c = "d";
    assertEqual({ a: "b", c: "d" }, tc().viewAssigns());
  });

  it("view_assigns excludes internal ivars", () => {
    for (const ivar of INTERNAL_IVARS) {
      assert(ivar !== undefined, `expected ${ivar} to be defined`);
      assertNotIncludes(
        Object.keys(tc().viewAssigns()),
        ivar.replaceAll("@", ""),
        `expected ${ivar} to be excluded from view_assigns`,
      );
    }
  });
});

const HelperExposureTest = named(
  class HelperExposureTest extends TestCase {
    fromTestCase({ suffix = "?" }: { suffix?: string } = {}) {
      return `Word${suffix}`;
    }
  },
  "HelperExposureTest",
);
(HelperExposureTest as TestCaseClass).helper({
  renderFromHelper(this: Tc) {
    return this.fromTestCase({ suffix: "!" });
  },
});
(HelperExposureTest as TestCaseClass).helperMethod("fromTestCase");

describe("HelperExposureTest", () => {
  const tc = testCase(HelperExposureTest as TestCaseClass);

  it("is able to make methods available to the view", async () => {
    assertEqual("Word!", String(await tc().render({ partial: "test/from_helper" })));
  });
});

const HelperThatInvokesProtectAgainstForgery = {
  helpMe(this: Tc) {
    return this.isProtectAgainstForgery();
  },
};

const IgnoreProtectAgainstForgeryTest = named(
  class IgnoreProtectAgainstForgeryTest extends TestCase {},
  "IgnoreProtectAgainstForgeryTest",
);
(IgnoreProtectAgainstForgeryTest as TestCaseClass).helper(HelperThatInvokesProtectAgainstForgery);

describe("IgnoreProtectAgainstForgeryTest", () => {
  const tc = testCase(IgnoreProtectAgainstForgeryTest as TestCaseClass);

  it("protect_from_forgery? in any helpers returns false", () => {
    assertNot(tc().view().helpMe());
  });
});

const ATestHelperTest = named(class ATestHelperTest extends TestCase {}, "ATestHelperTest");

describe("ATestHelperTest", () => {
  const testCase_ = ATestHelperTest as TestCaseClass;
  const tc = testCase(testCase_, sharedTestsSetup);

  it("inflects the name of the helper module to test from the test case class", () => {
    assertEqual(ATestHelper, testCase_.helperClass);
    assertIncludes(rbModAncestors(testCase_), ATestHelper);
  });

  it("a configured test controller is available", () => {
    assertKindOf(ActionController.Base, tc().controller);
    assertEqual("", tc().controller.controllerPath());
  });

  it("no additional helpers should shared across test cases", async () => {
    assertNotIncludes(rbModAncestors(testCase_), AnotherTestHelper);
    await assertRaise([NoMethodError], {}, () => rbFSend(tc(), "fromAnotherHelper"));
  });

  it("is able to use routes", () => {
    tc().controller.request.assignParameters(tc().routes, "foo", "index", {}, "/foo", []);
    tc().withRouting((set: any) => {
      set.draw(function (this: any) {
        this.get("foo", { to: "foo#index" });
        this.get("bar", { to: "bar#index" });
      });
      assertEqual("/foo", tc().urlFor());
      assertEqual("/bar", tc().urlFor({ controller: "bar" }));
    });
  });

  it("is able to use named routes", () => {
    tc().withRouting((set: any) => {
      set.draw(function (this: any) {
        this.resources("contents");
      });
      assertEqual("http://test.host/contents/new", tc().newContentUrl());
      assertEqual("http://test.host/contents/1", tc().contentUrl({ id: 1 }));
    });
  });

  it.skip("is able to use mounted routes", () => {
    // BLOCKED: actionview-test-case-mounted-routes-test
  });

  it("named routes can be used from helper included in view", async () => {
    await tc().withRouting(async (set: any) => {
      set.draw(function (this: any) {
        this.resources("contents");
      });
      (tc()._helpers as Record<string, unknown>).renderFromHelper = function (this: Tc) {
        return this.newContentUrl();
      };

      assertEqual(
        "http://test.host/contents/new",
        String(await tc().render({ partial: "test/from_helper" })),
      );
    });
  });

  it("is able to render partials with local variables", async () => {
    assertEqual(
      "Eloy",
      String(await tc().render("developers/developer", { developer: new DeveloperStruct("Eloy") })),
    );
    assertEqual(
      "Eloy",
      String(
        await tc().render({
          partial: "developers/developer",
          locals: { developer: new DeveloperStruct("Eloy") },
        }),
      ),
    );
  });

  it("is able to render partials from templates and also use instance variables", async () => {
    tc().controller.setControllerPath("test");

    tc().customers = [new DeveloperStruct("Eloy"), new DeveloperStruct("Manfred")];
    assertMatch(/Hello: EloyHello: Manfred/, String(await tc().render({ template: "test/list" })));
  });

  it("is able to render partials from templates and also use instance variables after view has been referenced", async () => {
    tc().controller.setControllerPath("test");

    tc().view();

    tc().customers = [new DeveloperStruct("Eloy"), new DeveloperStruct("Manfred")];
    assertMatch(/Hello: EloyHello: Manfred/, String(await tc().render({ template: "test/list" })));
  });

  it("is able to use helpers that depend on the view flow", () => {
    assertNot(tc().isContentFor("foo"));

    tc().contentFor("foo", "bar");
    assert(tc().isContentFor("foo"));
    assertEqual("bar", String(tc().contentFor("foo")));
  });
});

const AssertionsTest = named(
  class AssertionsTest extends TestCase {
    renderFromHelper(this: Tc) {
      return this.formTag("/foo", {}, async () => {
        this.safeConcat(await this.render({ plain: "<ul><li>foo</li></ul>" }));
      });
    }
  },
  "AssertionsTest",
);
(AssertionsTest as TestCaseClass).helperMethod("renderFromHelper");

describe("AssertionsTest", () => {
  const tc = testCase(AssertionsTest as TestCaseClass);

  it("uses the output_buffer for assert_select", async () => {
    await tc().render({ partial: "test/from_helper" });

    tc().assertSelect("form", () => {
      tc().assertSelect("li", { text: "foo" });
    });
  });

  it("do not memoize the document_root_element in view tests", () => {
    tc().concat(tc().formTag("/foo"));

    tc().assertSelect("form");

    tc().concat(tc().contentTag("b", "Strong", { class: "foo" }));

    tc().assertSelect("form");
    tc().assertSelect("b.foo");
  });
});

const PlaceholderAssertionsTest = named(
  class PlaceholderAssertionsTest extends TestCase {
    renderFromHelper(this: Tc) {
      return this.contentTag("a", "foo", { href: "/bar" });
    }
  },
  "PlaceholderAssertionsTest",
);
(PlaceholderAssertionsTest as TestCaseClass).helperMethod("renderFromHelper");

describe("PlaceholderAssertionsTest", () => {
  const tc = testCase(PlaceholderAssertionsTest as TestCaseClass);

  it("supports placeholders in assert_select calls", async () => {
    await tc().render({ partial: "test/from_helper" });

    tc().assertSelect("a[href=?]", "/bar", { text: "foo" });
  });
});

describe("CapybaraHTMLEncoderTest", () => {
  it.skip("document_root_element can be configured to utilize Vitest", () => {
    // PERMANENT-SKIP: CLAUDE.md, "System testing runs on Vitest (`SystemTestCase`, `SystemTesting::*`)" — no Capybara.
  });
});

const RenderedViewContentTest = named(
  class RenderedViewContentTest extends TestCase {},
  "RenderedViewContentTest",
);

describe("RenderedViewContentTest", () => {
  const tc = testCase(RenderedViewContentTest as TestCaseClass);

  it("#rendered inherits from String", async () => {
    const developer = new DeveloperStruct("Eloy");

    await tc().render("developers/developer", { developer: developer });

    assertKindOf(rbCString as never, tc().rendered);
    assertKindOf(String, tc().rendered.toString());
    assertEqual(developer.name, tc().rendered.toString());
    assertMatch(new RegExp(developer.name), tc().rendered.toString());
    assertIncludes(tc().rendered.toString(), developer.name);
  });

  it("#rendered resets after each render", async () => {
    await tc().render("developers/developer", { developer: new DeveloperStruct("first") });

    assertIncludes(tc().rendered.toString(), "first");
    assertNotIncludes(tc().rendered.toString(), "second");
    assertNotIncludes(tc().rendered.toString(), "third");

    await tc().render("developers/developer", { developer: new DeveloperStruct("second") });

    assertIncludes(tc().rendered.toString(), "first");
    assertIncludes(tc().rendered.toString(), "second");
    assertNotIncludes(tc().rendered.toString(), "third");

    await tc().render("developers/developer", { developer: new DeveloperStruct("third") });

    assertIncludes(tc().rendered.toString(), "first");
    assertIncludes(tc().rendered.toString(), "second");
    assertIncludes(tc().rendered.toString(), "third");
  });
});

const HTMLParserTest = named(class HTMLParserTest extends TestCase {}, "HTMLParserTest");

describe("HTMLParserTest", () => {
  const tc = testCase(HTMLParserTest as TestCaseClass);

  it("rendered.html is a Nokogiri::XML::DocumentFragment", async () => {
    const developer = new DeveloperStruct("Eloy");

    await tc().render("developers/developer", { developer: developer });

    assertKindOf(HTML5.DocumentFragment as never, tc().rendered.html());
    assertEqual(tc().rendered.toString(), tc().rendered.html().toString());
    assertEqual(developer.name, tc().documentRootElement().text);
  });

  it("do not memoize the rendered.html in view tests", () => {
    tc().concat(tc().formTag("/foo"));

    assertEqual("/foo", tc().documentRootElement().atCss("form").get("action"));

    tc().concat(tc().contentTag("b", "Strong", { class: "foo" }));

    assertEqual("/foo", tc().documentRootElement().atCss("form").get("action"));
    assertEqual("foo", tc().documentRootElement().atCss("b").get("class"));
  });
});

const JSONParserTest = named(class JSONParserTest extends TestCase {}, "JSONParserTest");

describe("JSONParserTest", () => {
  const tc = testCase(JSONParserTest as TestCaseClass);

  it("rendered.json is an ActiveSupport::HashWithIndifferentAccess", async () => {
    const developer = new DeveloperStruct("Eloy");

    await tc().render({
      formats: ":json",
      partial: "developers/developer",
      locals: { developer: developer },
    });

    assertKindOf(HashWithIndifferentAccess, tc().rendered.json());
    assertEqual(tc().rendered.toString(), JSON.stringify(tc().rendered.json()));
    assertEqual(developer.name, tc().rendered.json().get("name"));
  });
});

const MissingHTMLParserTest = named(
  class MissingHTMLParserTest extends TestCase {},
  "MissingHTMLParserTest",
);
(MissingHTMLParserTest as TestCaseClass).registerParser("html", null);

describe("MissingHTMLParserTest", () => {
  const tc = testCase(MissingHTMLParserTest as TestCaseClass);

  it("rendered.html falls back to returning the value when the parser is missing", async () => {
    const developer = new DeveloperStruct("Eloy");

    await tc().render("developers/developer", { developer: developer });

    assertKindOf(String, tc().rendered.html());
    assertEqual(developer.name, tc().rendered.html());
  });
});

describe("AHelperWithInitializeTest", () => {
  it.skip("the helper's initialize was actually called", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A module's `initialize` is inlined into the constructor (`@inlinedFrom`)" — a helper module has no `initialize` to run.
  });
});

describe("PatternMatchingTestCases", () => {
  it.skip("document_root_element integrates with pattern matching", () => {
    // BLOCKED: actionview-test-case-pattern-matching-tests
  });
  it.skip("rendered.html integrates with pattern matching", () => {
    // BLOCKED: actionview-test-case-pattern-matching-tests
  });
  it.skip("rendered.json integrates with pattern matching", () => {
    // BLOCKED: actionview-test-case-pattern-matching-tests
  });
});
