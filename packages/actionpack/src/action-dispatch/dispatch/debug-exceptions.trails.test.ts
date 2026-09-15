import { describe, it, expect } from "vitest";
import { DebugExceptions } from "../middleware/debug-exceptions.js";
import { Request } from "../http/request.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

const errorApp = async (_env: RackEnv): Promise<RackResponse> => {
  throw new Error("Something went wrong");
};

const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

async function contentTypeFor(
  accept: string,
  responseFormat: "default" | "api" = "default",
): Promise<string> {
  const [, headers] = await new DebugExceptions(errorApp, { responseFormat }).call({
    REQUEST_METHOD: "GET",
    PATH_INFO: "/test",
    HTTP_ACCEPT: accept,
  });
  return String(headers["content-type"]);
}

describe("DebugExceptions format negotiation", () => {
  it("renders HTML for a browser Accept header that also lists application/xml", async () => {
    expect(await contentTypeFor(BROWSER_ACCEPT)).toContain("text/html");
    expect(await contentTypeFor(BROWSER_ACCEPT, "api")).toContain("text/html");
  });

  it("renders the browser page for application/json outside the api response format", async () => {
    expect(await contentTypeFor("application/json")).toContain("text/html");
  });

  it("renders JSON for application/json in the api response format", async () => {
    expect(await contentTypeFor("application/json", "api")).toContain("application/json");
  });

  it("renders XML for an explicit application/xml in the api response format", async () => {
    expect(await contentTypeFor("application/xml", "api")).toContain("application/xml");
  });

  it("falls back to HTML for a browser-like Accept listing */*, as request.formats does", async () => {
    expect(await contentTypeFor("application/json,*/*", "api")).toContain("text/html");
  });

  it("decides api_request? from the highest-q format, not the first substring", async () => {
    expect(await contentTypeFor("text/html;q=0.5,application/json", "api")).toContain(
      "application/json",
    );
  });
});

describe("DebugExceptions browser render", () => {
  it("renders HTML, not text, for a non-XHR request with a text/plain body", async () => {
    const [, headers] = await new DebugExceptions(errorApp).call({
      REQUEST_METHOD: "POST",
      PATH_INFO: "/test",
      CONTENT_TYPE: "text/plain",
    });
    expect(String(headers["content-type"])).toContain("text/html");
  });
});

describe("DebugExceptions interceptors", () => {
  it("receives the ActionDispatch::Request call built, not the Rack env", async () => {
    let received: unknown;
    await new DebugExceptions(errorApp, {
      interceptors: [(request) => (received = request)],
    }).call({ REQUEST_METHOD: "GET", PATH_INFO: "/test" });
    expect(received).toBeInstanceOf(Request);
  });
});
