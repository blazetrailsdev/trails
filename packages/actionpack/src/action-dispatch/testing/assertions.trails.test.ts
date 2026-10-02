import { describe, expect, it } from "vitest";
import { DomTestingAssertions } from "@blazetrails/actionview";
import { include, isModuleIncluded, Module, NoMethodError } from "@blazetrails/ruby-compat";
import { Assertion } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { TestCase } from "../../action-controller/test-case.js";
import { TemplateAssertions } from "../../action-controller/template-assertions.js";
import { RouteSet } from "../routing/route-set.js";
import { Assertions } from "./assertions.js";
import { ResponseAssertions, assertResponse } from "./assertions/response.js";
import {
  ClassMethods,
  RoutingAssertions,
  assertRouting,
  type RoutingAssertionsHost,
} from "./assertions/routing.js";
import { IntegrationTest } from "./integration.js";
import { ActionController, ActionDispatch } from "../../namespaces.js";

describe("ActionDispatch::Assertions", () => {
  it("is included, with the modules it includes, by ActionController::TestCase and IntegrationTest", () => {
    for (const klass of [TestCase, IntegrationTest]) {
      for (const mod of [Assertions, ResponseAssertions, RoutingAssertions, DomTestingAssertions]) {
        expect(isModuleIncluded(klass, mod)).toBe(true);
      }
      expect(klass.prototype.assertResponse).toBe(assertResponse);
      expect(klass.prototype.assertRouting).toBe(assertRouting);
      expect(Object.hasOwn(klass.prototype, "assertResponse")).toBe(false);
    }
    expect(isModuleIncluded(TestCase, TemplateAssertions)).toBe(true);
  });

  it("answers assert_dom_equal and assert_dom_not_equal on the including test case", () => {
    const test = new TestCase("test");

    test.assertDomEqual('<a href="/x" class="y">z</a>', '<a class="y" href="/x">z</a>');
    test.assertDomNotEqual("<a>z</a>", "<b>z</b>");
    expect(() => test.assertDomEqual("<a>z</a>", "<b>z</b>")).toThrow(Assertion);
  });

  it("is seated at its Rails constant path, with the modules nested in it", () => {
    expect(ActionDispatch.Assertions).toBe(Assertions);
    expect(Assertions.ResponseAssertions).toBe(ResponseAssertions);
    expect(Assertions.RoutingAssertions).toBe(RoutingAssertions);
    expect(Assertions.name).toBe("ActionDispatch::Assertions");
    expect(ResponseAssertions.name).toBe("ActionDispatch::Assertions::ResponseAssertions");
    expect(RoutingAssertions.name).toBe("ActionDispatch::Assertions::RoutingAssertions");
    expect(ActionController.TemplateAssertions).toBe(TemplateAssertions);
    expect(TemplateAssertions.name).toBe("ActionController::TemplateAssertions");
    expect(ActionController.TestCase).toBe(TestCase);
  });

  it("extends the includer with RoutingAssertions::ClassMethods", () => {
    expect(TestCase.withRouting).toBe(ClassMethods.withRouting);
  });

  it("reads html_document off the including test case", () => {
    class HtmlDocumentTest extends ActiveSupportTestCase {}
    include(HtmlDocumentTest, Assertions);
    const test = new HtmlDocumentTest("test") as HtmlDocumentTest & Assertions;
    Object.assign(test, { response: { mediaType: "application/xml", body: "<a><b/></a>" } });

    expect(test.htmlDocument.root.name).toBe("a");
  });

  it("method_missing sends a named route to the controller, and supers otherwise", () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/posts", { to: "posts#index", as: "posts" });
    });
    const Fallback = new Module((mod) => {
      mod.defineMethod("methodMissing", (selector: string) => `fallback ${selector}`);
    });
    class WithSuper extends ActiveSupportTestCase {}
    include(WithSuper, Fallback);
    include(WithSuper, Assertions);
    class WithoutSuper extends ActiveSupportTestCase {}
    include(WithoutSuper, Assertions);

    const test = new WithSuper("test") as WithSuper &
      Assertions &
      RoutingAssertionsHost & { postsPath(): string };
    Object.assign(test, { routes, controller: { postsPath: () => "/posts" } });

    expect(test.postsPath()).toBe("/posts");
    expect(test.methodMissing("nope")).toBe("fallback nope");
    expect(() =>
      (new WithoutSuper("test") as WithoutSuper & Assertions & RoutingAssertionsHost).methodMissing(
        "nope",
      ),
    ).toThrow(NoMethodError);
  });
});
