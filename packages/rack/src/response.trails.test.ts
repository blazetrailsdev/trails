import { describe, it, expect } from "vitest";
import { ResponseRaw } from "./response.js";

describe("Rack::Response::Raw", () => {
  it("answers the Helpers status predicates", () => {
    const response = new ResponseRaw(204, {});
    expect(response.isNoContent).toBe(true);
    expect(response.isSuccessful).toBe(true);
    expect(response.isRedirection).toBe(false);
    expect(response.isClientError).toBe(false);
    expect(response.isServerError).toBe(false);
  });

  it("answers the Helpers header accessors", () => {
    const response = new ResponseRaw(200, {});
    response.contentType = "text/plain;charset=utf-8";
    expect(response.mediaType).toBe("text/plain");
    expect(response.mediaTypeParams).toEqual({ charset: "utf-8" });

    response.location = "/foo";
    expect(response.location).toBe("/foo");

    response.etag = '"abc"';
    expect(response.etag).toBe('"abc"');

    response.cacheControl = "public, max-age=60";
    expect(response.cacheControl).toBe("public, max-age=60");
  });

  it("answers cache! and do_not_cache!", () => {
    const response = new ResponseRaw(200, {});
    response.doNotCacheBang();
    expect(response.cacheControl).toBe("no-cache, must-revalidate");

    response.cacheBang(1000);
    expect(response.cacheControl).toBe("no-cache, must-revalidate");
  });
});
