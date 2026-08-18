import { describe, expect, it } from "vitest";

import { Request } from "../request.js";
import { BadRequest } from "../../action-controller/metal/exceptions.js";
import { paramsReadable, type MimeNegotiationHost } from "./mime-negotiation.js";
import { ParseError } from "./parameters.js";

function makeHost(parameters: () => unknown): MimeNegotiationHost {
  return {
    getHeader: () => undefined,
    setHeader: () => undefined,
    fetchHeader: <T>(key: string, fallback: (key: string) => T) => fallback(key),
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

describe("MimeNegotiation.contentMimeType", () => {
  it("caches through fetchHeader so a second read does not reparse", () => {
    const req = new Request({ CONTENT_TYPE: "application/xml" });
    expect(req.contentMimeType?.toString()).toBe("application/xml");
    expect(req.getHeader("action_dispatch.request.content_type")).toBe(req.contentMimeType);
  });

  it("looks up the empty media type when CONTENT_TYPE is blank", () => {
    const req = new Request({ CONTENT_TYPE: "" });
    expect(req.contentMimeType?.toString()).toBe("");
  });
});

describe("MimeNegotiation.accepts", () => {
  it("caches through fetchHeader so a second read does not reparse", () => {
    const req = new Request({ HTTP_ACCEPT: "application/xml,text/html" });
    expect(req.accepts.map((m) => m.toString())).toEqual(["application/xml", "text/html"]);
    expect(req.getHeader("action_dispatch.request.accepts")).toBe(req.accepts);
  });
});

describe("MimeNegotiation writers", () => {
  it("variant= raises ArgumentError for a non-Symbol", () => {
    const req = new Request({});
    expect(() => {
      (req as unknown as { variant: unknown }).variant = [1];
    }).toThrow("request.variant must be set to a Symbol or an Array of Symbols.");
  });

  it("format= forces the format regardless of the path extension", () => {
    const req = new Request({ PATH_INFO: "/posts/5.html" });
    req.format = "xml";
    expect(req.format.toString()).toBe("application/xml");
    expect(req.params["format"]).toBe("xml");
  });

  it("formats= sets the ordered list and leaves format as the first entry", () => {
    const req = new Request({ PATH_INFO: "/posts/5.html" });
    req.formats = ["json", "xml"];
    expect(req.formats.map((f) => f.toString())).toEqual(["application/json", "application/xml"]);
    expect(req.format.toString()).toBe("application/json");
  });
});
