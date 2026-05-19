import { describe, expect, it } from "vitest";

import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { paramsReadable, type MimeNegotiationHost } from "./mime-negotiation.js";
import { ParseError } from "./parameters.js";

function makeHost(parameters: () => unknown): MimeNegotiationHost {
  return {
    getHeader: () => undefined,
    setHeader: () => undefined,
    get parameters() {
      return parameters() as Record<string, unknown>;
    },
    accept: "",
    xhr: false,
  } as MimeNegotiationHost;
}

describe("MimeNegotiation.paramsReadable", () => {
  it("returns true when parameters[:format] is set", () => {
    const host = makeHost(() => ({ format: "json" }));
    expect(paramsReadable.call(host)).toBe(true);
  });

  it("returns false when parameters[:format] is absent", () => {
    const host = makeHost(() => ({}));
    expect(paramsReadable.call(host)).toBe(false);
  });

  it("swallows ActionController::BadRequest (Rails RESCUABLE_MIME_FORMAT_ERRORS)", () => {
    const host = makeHost(() => {
      throw new BadRequest("bad");
    });
    expect(paramsReadable.call(host)).toBe(false);
  });

  it("swallows ActionDispatch::Http::Parameters::ParseError", () => {
    const host = makeHost(() => {
      throw new ParseError("invalid JSON");
    });
    expect(paramsReadable.call(host)).toBe(false);
  });

  it("propagates unrelated exceptions (does NOT blanket-catch)", () => {
    const host = makeHost(() => {
      throw new RangeError("not a rescuable mime format error");
    });
    expect(() => paramsReadable.call(host)).toThrow(RangeError);
  });
});
