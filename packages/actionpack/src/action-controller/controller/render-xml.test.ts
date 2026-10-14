import { beforeEach, describe, it } from "vitest";
import { assertEqual, Logger } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Customer } from "../../test-helpers/lib/controller/fake-models.js";
import { deprecator as actionDispatchDeprecator } from "../../action-dispatch/deprecator.js";
import { Mime } from "../../action-dispatch/http/mime-type.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

describe("RenderXmlTest", () => {
  class XmlRenderable {
    toXml(options: Record<string, unknown>): string {
      options.root ||= "i-am-xml";
      return `<${options.root}/>`;
    }
  }

  class TestController extends Base {
    declare logger: Logger;

    static {
      this.protectFromForgery();
    }

    static override controllerPath(): string {
      return "test";
    }

    async renderWithLocation() {
      await this.render({ xml: "<hello/>", location: "http://example.com", status: 201 });
    }

    async renderWithObjectLocation() {
      const customer = new Customer("Some guy", 1);
      await this.render({ xml: "<customer/>", location: customer, status: "created" });
    }

    async renderWithToXml() {
      await this.render({ xml: new XmlRenderable() });
    }

    formattedXmlErb() {}

    async renderXmlWithCustomContentType() {
      await this.render({ xml: "<blah/>", contentType: "application/atomsvc+xml" });
    }

    async renderXmlWithCustomOptions() {
      await this.render({ xml: new XmlRenderable(), root: "i-am-THE-xml" } as Record<
        string,
        unknown
      >);
    }
  }

  class RenderXmlTest extends TestCase {
    declare controller: TestController;

    static {
      this.tests(TestController);
    }

    override setup() {
      super.setup();
      this.controller.logger = new Logger(null);

      this.request.host = "www.nextangle.com";
    }
  }

  let tc: RenderXmlTest;

  beforeEach(async ({ task }) => {
    tc = new RenderXmlTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("rendering with location should set header", async () => {
    await tc.get("renderWithLocation");
    assertEqual("http://example.com", tc.response.headers.get("Location"));
  });

  it("rendering xml should call to xml if possible", async () => {
    await tc.get("renderWithToXml");
    assertEqual("<i-am-xml/>", tc.response.body);
  });

  it("rendering xml should call to xml with extra options", async () => {
    await tc.get("renderXmlWithCustomOptions");
    assertEqual("<i-am-THE-xml/>", tc.response.body);
  });

  it("rendering with object location should set header with url for", async () => {
    await tc.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        this.resources("customers");

        actionDispatchDeprecator().silence(() => {
          this.get(":controller/:action");
        });
      });

      await tc.get("renderWithObjectLocation");
      assertEqual("http://www.nextangle.com/customers/1", tc.response.headers.get("Location"));
    });
  });

  it("should render formatted xml erb template", async () => {
    await tc.get("formattedXmlErb", { format: "xml" });
    assertEqual("<test>passed formatted xml erb</test>", tc.response.body);
  });

  it("should render xml but keep custom content type", async () => {
    await tc.get("renderXmlWithCustomContentType");
    assertEqual("application/atomsvc+xml", tc.response.mediaType);
  });

  // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
  it.skip("should use implicit content type", async () => {
    await tc.get("implicitContentType", { format: "atom" });
    assertEqual(Mime.get("atom"), tc.response.mediaType);
  });
});
