import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenURI } from "./open-uri.js";
import { URI } from "./uri/common.js";
import { HTTP } from "./uri/http.js";
import { block } from "./hash.js";

function respond(status: number, body: string, headers: Record<string, string> = {}) {
  return new Response(status >= 300 && status < 400 ? null : body, { status, headers });
}

describe("OpenURI::OpenRead#open", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("yields the body with its status and header fields, sending string-keyed headers", async () => {
    const fetch = vi.fn(async () => respond(200, "hello", { "Content-Type": "text/plain" }));
    vi.stubGlobal("fetch", fetch);
    const uri = URI.parse("http://example.com/a.txt") as HTTP;
    const result = await uri.open(
      { Foo: "Bar" },
      block((io: InstanceType<typeof OpenURI.Buffer>["io"]) => [
        io.read(),
        io.status,
        io.meta["content-type"],
      ]),
    );
    expect(result).toEqual(["hello", ["200", ""], "text/plain"]);
    expect(fetch).toHaveBeenCalledWith("http://example.com/a.txt", {
      headers: { Foo: "Bar" },
      redirect: "manual",
    });
  });

  it("follows a redirect and records the base URI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/old") ? respond(302, "", { Location: "/new" }) : respond(200, "moved"),
      ),
    );
    const io = (await (URI.parse("http://example.com/old") as HTTP).open()) as InstanceType<
      typeof OpenURI.Buffer
    >["io"];
    expect(io.read()).toEqual("moved");
    expect(String(io.baseUri)).toEqual("http://example.com/new");
  });

  it("raises OpenURI::HTTPError for an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
    );
    const error = await (URI.parse("http://example.com/x") as HTTP).read().catch((e) => e);
    expect(error).toBeInstanceOf(OpenURI.HTTPError);
    expect(error.message).toEqual("404 Not Found");
  });

  it("raises ArgumentError for an unrecognized symbol option", async () => {
    await expect(
      (URI.parse("http://example.com/x") as HTTP).open({ ":bogus": true }),
    ).rejects.toThrow("unrecognized option: bogus");
  });
});
