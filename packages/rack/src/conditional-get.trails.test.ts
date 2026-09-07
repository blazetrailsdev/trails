import { describe, expect, it } from "vitest";
import { ConditionalGet } from "./conditional-get.js";
import { MockRequest } from "./mock-request.js";

async function status(ifModifiedSince: string, lastModified: string): Promise<number> {
  const app = new ConditionalGet(async () => [
    200,
    { "last-modified": lastModified, "content-type": "text/plain" },
    ["TEST"],
  ]);
  const res = await new MockRequest((env) => app.call(env)).get("/", {
    HTTP_IF_MODIFIED_SINCE: ifModifiedSince,
  });
  return res.status;
}

describe("Rack::ConditionalGet#to_rfc2822", () => {
  it("parses the obsolete RFC2822 forms Time.rfc2822 accepts", async () => {
    expect(await status("2 Nov 97 09:55 A", "1 Nov 97 09:55 A")).toBe(304);
    expect(await status("Sun, 02 Nov 1997 09:55:00 -0600", "1 Nov 97 09:55 GMT")).toBe(304);
  });

  it("rejects non-RFC2822 strings JS Date accepts", async () => {
    const lastModified = "Sat, 01 Nov 1997 09:55:00 GMT";
    expect(await status("1997-11-02T09:55:00Z", lastModified)).toBe(200);
    expect(await status("December 17, 1995 03:24:00", lastModified)).toBe(200);
  });
});
