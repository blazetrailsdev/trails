import { describe, it, expect } from "vitest";
import { redirectBackOrTo } from "./redirecting.js";

describe("Redirecting#redirect_back_or_to", () => {
  const redirects: string[] = [];
  const host = {
    request: { host: "example.com", referer: "http://evil.test/x" },
    redirectTo: (location: string) => redirects.push(location),
  } as never;

  it("defaults allow_other_host only when the keyword is absent", () => {
    redirectBackOrTo.call(host, "/fallback", { allowOtherHost: null } as never);
    redirectBackOrTo.call(host, "/fallback");
    expect(redirects).toEqual(["/fallback", "http://evil.test/x"]);
  });
});
