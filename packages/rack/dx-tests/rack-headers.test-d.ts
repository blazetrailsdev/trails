import type { TCPSocket } from "@blazetrails/ruby-compat";
import type { RackHeaders, RackResponse } from "@blazetrails/rack";
import { describe, expectTypeOf, it } from "vitest";

describe("RackHeaders", () => {
  it("admits a rack.hijack callback beside ordinary headers", () => {
    const headers: RackHeaders = {
      "content-type": "text/plain",
      "rack.hijack": (stream: TCPSocket) => stream,
    };
    const response: RackResponse = [200, headers, []];
    expectTypeOf(response).toMatchTypeOf<RackResponse>();
  });

  it("rejects a callable under any other header name", () => {
    // @ts-expect-error a callback is a header value only under rack.hijack
    const headers: RackHeaders = { "x-hijack": (stream: TCPSocket) => stream };
    expectTypeOf(headers).toMatchTypeOf<RackHeaders>();
  });

  it("rejects a non-callable rack.hijack", () => {
    // @ts-expect-error rack.hijack is the partial-hijack callback
    const headers: RackHeaders = { "rack.hijack": 1 };
    expectTypeOf(headers).toMatchTypeOf<RackHeaders>();
  });
});
