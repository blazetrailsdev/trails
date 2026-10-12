import { describe, expect, it } from "vitest";
import { URL } from "./url.js";

describe("URL.fullUrlFor's :subdomain", () => {
  it("keeps the subdomain for a keyword forwarded as undefined", () => {
    expect(URL.fullUrlFor({ host: "www.example.com", subdomain: undefined })).toBe(
      "http://www.example.com",
    );
  });

  it("omits the subdomain for an explicit null", () => {
    expect(URL.fullUrlFor({ host: "www.example.com", subdomain: null })).toBe("http://example.com");
  });

  it("omits the port for a false port", () => {
    expect(URL.fullUrlFor({ host: "www.example.com:8443", port: false })).toBe(
      "http://www.example.com",
    );
  });
});
