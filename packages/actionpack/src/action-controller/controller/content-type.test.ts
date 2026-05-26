import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { Request } from "../../action-dispatch/request.js";
import { Response } from "../../action-dispatch/response.js";
import { Mime } from "../../action-dispatch/http/mime-type.js";

function makeRequest(opts: Record<string, unknown> = {}): Request {
  return new Request({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/",
    HTTP_HOST: "localhost",
    ...opts,
  });
}

function makeResponse(): Response {
  return new Response();
}

// ==========================================================================
// controller/content_type_test.rb — ContentTypeTest
// ==========================================================================
describe("ContentTypeTest", () => {
  it("test render defaults", async () => {
    class C extends Base {
      async action() {
        this.render({ body: "hello world!" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.response.charset).toBe("utf-8");
    expect(c.response.mediaType).toBe("text/plain");
  });

  it("test render changed charset default", async () => {
    const oldCharset = Response.defaultCharset;
    try {
      Response.defaultCharset = "utf-16";
      class C extends Base {
        async action() {
          this.render({ body: "hello world!" });
        }
      }
      const c = new C();
      await c.dispatch("action", makeRequest(), makeResponse());
      expect(c.response.charset).toBe("utf-16");
      expect(c.response.mediaType).toBe("text/plain");
    } finally {
      Response.defaultCharset = oldCharset;
    }
  });

  it("test content type from body", async () => {
    class C extends Base {
      async action() {
        this.response.contentType = Mime.fetch("rss").toString();
        this.render({ body: "hello world!" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.response.mediaType).toBe("application/rss+xml");
    expect(c.response.charset).toBe("utf-8");
  });

  it("test content type from render", async () => {
    class C extends Base {
      async action() {
        this.render({ body: "hello world!", contentType: Mime.fetch("rss").toString() });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.response.mediaType).toBe("application/rss+xml");
    expect(c.response.charset).toBe("utf-8");
  });

  it("test charset from body", async () => {
    class C extends Base {
      async action() {
        this.response.charset = "utf-16";
        this.render({ body: "hello world!" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.response.mediaType).toBe("text/plain");
    expect(c.response.charset).toBe("utf-16");
  });

  it("test nil charset from body", async () => {
    class C extends Base {
      async action() {
        this.response.charset = undefined;
        this.render({ body: "hello world!" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.response.mediaType).toBe("text/plain");
    expect(c.response.charset).toBe("utf-8");
  });

  it.skip("test nil default for erb", () => {
    // pending: requires ERB template rendering (ActionView not yet ported)
  });

  it.skip("test default for erb", () => {
    // pending: requires ERB template rendering (ActionView not yet ported)
  });

  it.skip("test default for builder", () => {
    // pending: requires builder template rendering (ActionView not yet ported)
  });

  it.skip("test change for builder", () => {
    // pending: requires builder template rendering + render action: (ActionView not yet ported)
  });

  it("test content type with charset", async () => {
    class C extends Base {
      async action() {
        this.response.contentType = "text/html; fragment; charset=utf-16";
        this.render({ body: "hello world!" });
      }
    }
    const c = new C();
    await c.dispatch("action", makeRequest(), makeResponse());
    expect(c.response.mediaType).toBe("text/html; fragment");
    expect(c.response.charset).toBe("utf-16");
  });
});

// ==========================================================================
// controller/content_type_test.rb — AcceptBasedContentTypeTest
// ==========================================================================
describe("AcceptBasedContentTypeTest", () => {
  it.skip("test render default content types for respond to", () => {
    // pending: requires respond_to block + template rendering (ActionView not yet ported)
  });

  it.skip("test render default content types for respond to with template", () => {
    // pending: requires respond_to block + template rendering (ActionView not yet ported)
  });

  it.skip("test render default content types for respond to with overwrite", () => {
    // pending: requires respond_to block + template rendering (ActionView not yet ported)
  });
});
