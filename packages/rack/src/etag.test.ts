import { describe, it, expect } from "vitest";
import { ETag } from "./etag.js";
import { MockRequest } from "./mock-request.js";

describe("Rack::ETag", () => {
  function etag(app: any, ...args: any[]) {
    return new ETag(app, ...args);
  }
  function request() {
    return MockRequest.envFor("/");
  }

  it("set etag if none is set if status is 200", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBe('W/"dffd6021bb2bd5b0af676290809ec3a5"');
  });

  it("returns a valid response body when using a linted app", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBe('W/"dffd6021bb2bd5b0af676290809ec3a5"');
    const chunks: string[] = [];
    for (const chunk of response[2]) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(["Hello, World!"]);
  });

  it("set etag if none is set if status is 201", async () => {
    const app = async () => [201, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBe('W/"dffd6021bb2bd5b0af676290809ec3a5"');
  });

  it("set cache-control to 'max-age=0, private, must-revalidate' (default) if none is set", async () => {
    const app = async () => [201, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["cache-control"]).toBe("max-age=0, private, must-revalidate");
  });

  it("set cache-control to chosen one if none is set", async () => {
    const app = async () => [201, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const response = await etag(app, null, "public").call(request());
    expect(response[1]["cache-control"]).toBe("public");
  });

  it("set a given cache-control even if digest could not be calculated", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, []] as any;
    const response = await etag(app, "no-cache").call(request());
    expect(response[1]["cache-control"]).toBe("no-cache");
  });

  it("not set cache-control if it is already set", async () => {
    const app = async () => [201, { "content-type": "text/plain", "cache-control": "public" }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["cache-control"]).toBe("public");
  });

  it("not set cache-control if directive isn't present", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, ["Hello, World!"]] as any;
    const response = await etag(app, null, null).call(request());
    expect(response[1]["cache-control"]).toBeUndefined();
  });

  it("not change etag if it is already set", async () => {
    const app = async () => [200, { "content-type": "text/plain", "etag": '"abc"' }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBe('"abc"');
  });

  it("not set etag if body is empty", async () => {
    const now = new Date().toUTCString();
    const app = async () => [200, { "content-type": "text/plain", "last-modified": now }, []] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBeUndefined();
  });

  it("set handle empty body parts", async () => {
    const app = async () => [200, { "content-type": "text/plain" }, ["Hello", "", ", World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBe('W/"dffd6021bb2bd5b0af676290809ec3a5"');
  });

  it("not set etag if last-modified is set", async () => {
    const now = new Date().toUTCString();
    const app = async () => [200, { "content-type": "text/plain", "last-modified": now }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBeUndefined();
  });

  it("not set etag if a sendfile_body is given", async () => {
    const sendfileBody = { each() {} }; // non-array body
    const app = async () => [200, { "content-type": "text/plain" }, sendfileBody] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBeUndefined();
  });

  it("not set etag if a status is not 200 or 201", async () => {
    const app = async () => [401, { "content-type": "text/plain" }, ["Access denied."]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBeUndefined();
  });

  it("set etag even if no-cache is given", async () => {
    const app = async () => [200, { "content-type": "text/plain", "cache-control": "no-cache, must-revalidate" }, ["Hello, World!"]] as any;
    const response = await etag(app).call(request());
    expect(response[1]["etag"]).toBe('W/"dffd6021bb2bd5b0af676290809ec3a5"');
  });

  it("close the original body", async () => {
    let closed = false;
    const body = { closed: false, close() { this.closed = true; closed = true; } };
    const app = async () => [200, {}, body] as any;
    const response = await etag(app).call(request());
    expect(closed).toBe(false);
    if (response[2].close) response[2].close();
    expect(closed).toBe(true);
  });
});
