import { beforeEach, describe, it } from "vitest";
import { FixtureResolver } from "@blazetrails/actionview";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { Mime } from "../../../action-dispatch/http/mime-type.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import { deprecator } from "../../../action-dispatch/deprecator.js";
import type { RouteSet } from "../../../action-dispatch/routing/route-set.js";
import { Rack } from "../../../test-helpers/abstract-unit.js";

registerConstant("ContentType", { name: "ContentType" });

class BaseController extends Base {
  async index(): Promise<void> {
    await this.render({ body: "Hello world!" });
  }

  async setOnResponseObj(): Promise<void> {
    this.response.contentType = Mime.get("rss");
    await this.render({ body: "Hello world!" });
  }

  async setOnRender(): Promise<void> {
    await this.render({ body: "Hello world!", contentType: Mime.get("rss") });
  }
}

class ImpliedController extends Base {
  static {
    this.viewPaths([
      new FixtureResolver({
        "content-type/implied/i-am-html-tse.html.tse": "Hello world!",
        "content-type/implied/i-am-xml-tse.xml.tse": "<xml>Hello world!</xml>",
        "content-type/implied/i-am-html-builder.html.builder": "xml.p 'Hello'",
        "content-type/implied/i-am-xml-builder.xml.builder": "xml.awesome 'Hello'",
      }),
    ]);
  }
}

class CharsetController extends Base {
  async setOnResponseObj(): Promise<void> {
    this.response.charset = "utf-16";
    await this.render({ body: "Hello world!" });
  }

  async setAsNilOnResponseObj(): Promise<void> {
    this.response.charset = null;
    await this.render({ body: "Hello world!" });
  }
}

for (const [klass, name] of [
  [BaseController, "ContentType::BaseController"],
  [ImpliedController, "ContentType::ImpliedController"],
  [CharsetController, "ContentType::CharsetController"],
] as const) {
  Object.defineProperty(klass, "name", { value: name });
}
controllerConstants.set("content_type/base", BaseController);
controllerConstants.set("content_type/implied", ImpliedController);
controllerConstants.set("content_type/charset", CharsetController);

let t: InstanceType<typeof Rack.TestCase>;
const assertBody = (body: string): void => t.assertBody(body);
const assertHeader = (name: string, value: string): void => t.assertHeader(name, value);

class ExplicitContentTypeTest extends Rack.TestCase {}

describe("ExplicitContentTypeTest", () => {
  beforeEach(({ task }) => {
    t = new ExplicitContentTypeTest(task.name);
  });

  it("default response is text/plain and UTF8", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":controller", { action: "index" });
        });
      });

      await t.get("/content_type/base");

      assertBody("Hello world!");
      assertHeader("Content-Type", "text/plain; charset=utf-8");
    });
  });

  it("setting the content type of the response directly on the response object", async () => {
    await t.get("/content_type/base/setOnResponseObj");

    assertBody("Hello world!");
    assertHeader("Content-Type", "application/rss+xml; charset=utf-8");
  });

  it("setting the content type of the response as an option to render", async () => {
    await t.get("/content_type/base/setOnRender");

    assertBody("Hello world!");
    assertHeader("Content-Type", "application/rss+xml; charset=utf-8");
  });
});

class ImpliedContentTypeTest extends Rack.TestCase {}

describe("ImpliedContentTypeTest", () => {
  beforeEach(({ task }) => {
    t = new ImpliedContentTypeTest(task.name);
  });

  it("sets Content-Type as text/html when rendering *.html.tse", async () => {
    await t.get("/content_type/implied/iAmHtmlTse");

    assertHeader("Content-Type", "text/html; charset=utf-8");
  });

  it("sets Content-Type as application/xml when rendering *.xml.tse", async () => {
    await t.get("/content_type/implied/iAmXmlTse", { params: { format: "xml" } });

    assertHeader("Content-Type", "application/xml; charset=utf-8");
  });

  // BLOCKED: builder-template-handler-and-actionpack-builder-fixtures
  it.skip("sets Content-Type as text/html when rendering *.html.builder", async () => {
    await t.get("/content_type/implied/iAmHtmlBuilder");

    assertHeader("Content-Type", "text/html; charset=utf-8");
  });

  // BLOCKED: builder-template-handler-and-actionpack-builder-fixtures
  it.skip("sets Content-Type as application/xml when rendering *.xml.builder", async () => {
    await t.get("/content_type/implied/iAmXmlBuilder", { params: { format: "xml" } });

    assertHeader("Content-Type", "application/xml; charset=utf-8");
  });
});

class ExplicitCharsetTest extends Rack.TestCase {}

describe("ExplicitCharsetTest", () => {
  beforeEach(({ task }) => {
    t = new ExplicitCharsetTest(task.name);
  });

  it("setting the charset of the response directly on the response object", async () => {
    await t.get("/content_type/charset/setOnResponseObj");

    assertBody("Hello world!");
    assertHeader("Content-Type", "text/plain; charset=utf-16");
  });

  it("setting the charset of the response as nil directly on the response object", async () => {
    await t.get("/content_type/charset/setAsNilOnResponseObj");

    assertBody("Hello world!");
    assertHeader("Content-Type", "text/plain; charset=utf-8");
  });
});
