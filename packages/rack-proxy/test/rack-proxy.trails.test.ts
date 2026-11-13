import { describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";

describe("Rack::Proxy (trails)", () => {
  it("keeps a header whose name is an Object.prototype member", () => {
    const headers = Proxy.extractHttpRequestHeaders({
      HTTP_CONSTRUCTOR: "a",
      HTTP___PROTO__: "b",
      HTTP_CONNECTION: "close",
    });
    expect(headers.get("Constructor")).toBe("a");
    expect(headers.hasKey("Connection")).toBe(false);
  });

  it("drops trailing empty fields when titleizing, as Ruby's split does", () => {
    const proxyClass = Proxy as unknown as { reconstructHeaderName(name: string): string };
    expect(proxyClass.reconstructHeaderName("HTTP_FOO_")).toBe("Foo");
  });
});
