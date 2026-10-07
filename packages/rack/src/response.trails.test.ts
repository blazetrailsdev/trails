import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Response, ResponseRaw } from "./response.js";

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

describe("Rack::Response.new", () => {
  it("raises unless headers is a Hash", () => {
    expect(() => new Response(null, 200, [] as never)).toThrow(ArgumentError);
    expect(() => new Response(null, 200, [] as never)).toThrow("Headers must be a Hash!");
  });
});

describe("Rack::Response with a byte part", () => {
  const bytes = Uint8Array.from([0x00, 0x80, 0xe2, 0xff, 0x41]);
  const each = {
    each(block: (part: string | Uint8Array) => void) {
      block(bytes);
      block("—");
    },
  };

  it("buffers an each body's byte part as it is and counts its bytes", () => {
    const response = new Response(each);
    response.write("x");
    const [, headers, body] = response.finish();

    expect(headers["content-length"]).toBe("9");
    expect([...body]).toEqual([bytes, "—", "x"]);
  });

  it("counts an Array body's byte part by its bytes", () => {
    const response = new Response([bytes, "—"]);

    expect(response.finish()[1]["content-length"]).toBe("8");
  });

  it("writes a byte chunk as it is", () => {
    const response = new Response();
    response.write(bytes);
    const [, headers, body] = response.finish();

    expect(headers["content-length"]).toBe("5");
    expect([...body]).toEqual([bytes]);
  });
});
