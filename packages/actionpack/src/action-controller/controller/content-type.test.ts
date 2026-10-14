import { beforeEach, describe, it } from "vitest";
import { assertEqual, assertNil, Logger } from "@blazetrails/activesupport";
import { rbInspect } from "@blazetrails/ruby-compat";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { Mime } from "../../action-dispatch/http/mime-type.js";
import { Response } from "../../action-dispatch/http/response.js";

class OldContentTypeController extends Base {
  declare logger: Logger;

  async renderContentTypeFromBody() {
    this.response.contentType = Mime.get("rss");
    await this.render({ body: "hello world!" });
  }

  async renderDefaults() {
    await this.render({ body: "hello world!" });
  }

  async renderContentTypeFromRender() {
    await this.render({ body: "hello world!", contentType: Mime.get("rss") });
  }

  async renderCharsetFromBody() {
    this.response.charset = "utf-16";
    await this.render({ body: "hello world!" });
  }

  async renderNilCharsetFromBody() {
    this.response.charset = null;
    await this.render({ body: "hello world!" });
  }

  renderDefaultForTse() {}

  renderDefaultForBuilder() {}

  async renderChangeForBuilder() {
    this.response.contentType = Mime.get("html");
    await this.render({ action: "renderDefaultForBuilder" });
  }

  async renderDefaultContentTypesForRespondTo() {
    await this.respondTo((format) => {
      format.html(() => this.render({ body: "hello world!" }));
      format.xml(() => this.render({ action: "renderDefaultContentTypesForRespondTo" }));
      format.js(() => this.render({ body: "hello world!" }));
      format.rss(() => this.render({ body: "hello world!", contentType: Mime.get("xml") }));
    });
  }

  async renderContentTypeWithCharset() {
    this.response.contentType = "text/html; fragment; charset=utf-16";
    await this.render({ body: "hello world!" });
  }
}

describe("ContentTypeTest", () => {
  class ContentTypeTest extends TestCase {
    declare controller: OldContentTypeController;

    static {
      this.tests(OldContentTypeController);
    }

    override setup() {
      super.setup();
      this.controller.logger = new Logger(null);
    }

    async withDefaultCharset(charset: string | null, block: () => Promise<void>) {
      const oldDefaultCharset = Response.defaultCharset;
      Response.defaultCharset = charset;
      try {
        await block();
      } finally {
        Response.defaultCharset = oldDefaultCharset;
      }
    }
  }

  let tc: ContentTypeTest;

  beforeEach(async ({ task }) => {
    tc = new ContentTypeTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render defaults", async () => {
    await tc.get("renderDefaults");
    assertEqual("utf-8", tc.response.charset);
    assertEqual(Mime.get("text"), tc.response.mediaType);
  });

  it("render changed charset default", async () => {
    await tc.withDefaultCharset("utf-16", async () => {
      await tc.get("renderDefaults");
      assertEqual("utf-16", tc.response.charset);
      assertEqual(Mime.get("text"), tc.response.mediaType);
    });
  });

  it("content type from body", async () => {
    await tc.get("renderContentTypeFromBody");
    assertEqual(Mime.get("rss"), tc.response.mediaType);
    assertEqual("utf-8", tc.response.charset);
  });

  it("content type from render", async () => {
    await tc.get("renderContentTypeFromRender");
    assertEqual(Mime.get("rss"), tc.response.mediaType);
    assertEqual("utf-8", tc.response.charset);
  });

  it("charset from body", async () => {
    await tc.get("renderCharsetFromBody");
    assertEqual(Mime.get("text"), tc.response.mediaType);
    assertEqual("utf-16", tc.response.charset);
  });

  it("nil charset from body", async () => {
    await tc.get("renderNilCharsetFromBody");
    assertEqual(Mime.get("text"), tc.response.mediaType);
    assertEqual("utf-8", tc.response.charset, rbInspect(tc.response.headers));
  });

  it("nil default for tse", async () => {
    await tc.withDefaultCharset(null, async () => {
      await tc.get("renderDefaultForTse");
      assertEqual(Mime.get("html"), tc.response.mediaType);
      assertNil(tc.response.charset, rbInspect(tc.response.headers));
    });
  });

  it("default for tse", async () => {
    await tc.get("renderDefaultForTse");
    assertEqual(Mime.get("html"), tc.response.mediaType);
    assertEqual("utf-8", tc.response.charset);
  });

  // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
  it.skip("default for builder", async () => {
    await tc.get("renderDefaultForBuilder");
    assertEqual(Mime.get("xml"), tc.response.mediaType);
    assertEqual("utf-8", tc.response.charset);
  });

  // PERMANENT-SKIP: renders a `.builder` template; `template/handlers/builder.rb` is unported (scripts/parity/unported-files/actionview.ts), the `builder` gem being a third-party runtime dep.
  it.skip("change for builder", async () => {
    await tc.get("renderChangeForBuilder");
    assertEqual(Mime.get("html"), tc.response.mediaType);
    assertEqual("utf-8", tc.response.charset);
  });

  it("content type with charset", async () => {
    await tc.get("renderContentTypeWithCharset");
    assertEqual("text/html; fragment", tc.response.mediaType);
    assertEqual("utf-16", tc.response.charset);
  });
});

describe("AcceptBasedContentTypeTest", () => {
  class AcceptBasedContentTypeTest extends TestCase {
    static {
      this.tests(OldContentTypeController);
    }
  }

  let tc: AcceptBasedContentTypeTest;

  beforeEach(async ({ task }) => {
    tc = new AcceptBasedContentTypeTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("render default content types for respond to", async () => {
    tc.request.accept = Mime.get("html")!.toString();
    await tc.get("renderDefaultContentTypesForRespondTo");
    assertEqual(Mime.get("html"), tc.response.mediaType);

    tc.request.accept = Mime.get("js")!.toString();
    await tc.get("renderDefaultContentTypesForRespondTo");
    assertEqual(Mime.get("js"), tc.response.mediaType);
  });

  it("render default content types for respond to with template", async () => {
    tc.request.accept = Mime.get("xml")!.toString();
    await tc.get("renderDefaultContentTypesForRespondTo");
    assertEqual(Mime.get("xml"), tc.response.mediaType);
  });

  it("render default content types for respond to with overwrite", async () => {
    tc.request.accept = Mime.get("rss")!.toString();
    await tc.get("renderDefaultContentTypesForRespondTo");
    assertEqual(Mime.get("xml"), tc.response.mediaType);
  });
});
