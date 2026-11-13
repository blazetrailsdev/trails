import { constDefined, constSet, OpenSSL, rbObjIvarGet, TopLevel } from "@blazetrails/ruby-compat";
import { Headers, Rack } from "@blazetrails/rack";
import { describe, expect, it } from "vitest";

import { Proxy } from "../lib/index.js";

describe("RackProxyTest", () => {
  it("normalize headers", () => {
    const proxyClass = Proxy;
    const headers = { header_array: ["first_entry"], header_non_array: "entry" };

    const normalizedHeaders = proxyClass.normalizeHeaders(headers);
    const expectedClass = constDefined(Rack, "Headers") ? Headers : null;
    expect(normalizedHeaders.constructor === expectedClass).toBeTruthy();
    expect(normalizedHeaders.get("header_array") === "first_entry").toBeTruthy();
    expect(normalizedHeaders.get("header_non_array") === "entry").toBeTruthy();
  });

  it("header reconstruction", () => {
    const proxyClass = Proxy as unknown as { reconstructHeaderName(name: string): string };

    let header = proxyClass.reconstructHeaderName("HTTP_ABC");
    expect(header === "Abc").toBeTruthy();

    header = proxyClass.reconstructHeaderName("HTTP_ABC_D");
    expect(header === "Abc-D").toBeTruthy();
  });

  it("extract http request headers", () => {
    const proxyClass = Proxy;
    const env = {
      "NOT-HTTP-HEADER": "test-value",
      HTTP_ACCEPT: "text/html",
      HTTP_CONNECTION: null,
      HTTP_CONTENT_MD5: "deadbeef",
      "HTTP_HEADER.WITH.PERIODS": "stillmooing",
    };

    const headers = proxyClass.extractHttpRequestHeaders(env);
    expect(headers.hasKey("ACCEPT")).toBeTruthy();
    expect(headers.hasKey("CONTENT-MD5")).toBeTruthy();
    expect(headers.hasKey("HEADER.WITH.PERIODS")).toBeTruthy();
    expect(!headers.hasKey("CONNECTION")).toBeTruthy();
    expect(!headers.hasKey("NOT-HTTP-HEADER")).toBeTruthy();
  });

  it("duplicate headers", () => {
    const proxyClass = Proxy;
    const env = { "Set-Cookie": ["cookie1=foo", "cookie2=bar"] };

    const headers = proxyClass.normalizeHeaders(env);
    expect(
      headers.get("Set-Cookie")!.includes("cookie1=foo"),
      "Include the first value",
    ).toBeTruthy();
    // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors rack_proxy_test.rb:135
    if (constDefined(Rack, "Headers", false)) {
      // eslint-disable-next-line vitest/no-conditional-expect -- mirrors rack_proxy_test.rb:136
      expect(headers.get("Set-Cookie")).toEqual(["cookie1=foo", "cookie2=bar"]);
    } else {
      // eslint-disable-next-line vitest/no-conditional-expect -- mirrors rack_proxy_test.rb:138
      expect(
        headers.get("Set-Cookie")!.includes("\n"),
        "Rack 2 joins multiple cookies with newlines",
      ).toBeTruthy();
    }
    expect(
      headers.get("Set-Cookie")!.includes("cookie2=bar"),
      "Include the second value",
    ).toBeTruthy();
  });

  it("ssl default is verify peer", () => {
    const proxy = new Proxy();
    expect(
      rbObjIvarGet(proxy, "@verify_mode") ?? null,
      "@verify_mode should be unset by default so VERIFY_PEER applies at request time",
    ).toBeNull();
  });

  it("ssl verify none opt in", () => {
    const proxy = new Proxy({ sslVerifyNone: true });
    expect(rbObjIvarGet(proxy, "@verify_mode")).toEqual(OpenSSL.SSL.VERIFY_NONE);
  });

  it("explicit verify mode wins over ssl verify none", () => {
    const proxy = new Proxy({ sslVerifyNone: true, verifyMode: OpenSSL.SSL.VERIFY_PEER });
    expect(rbObjIvarGet(proxy, "@verify_mode")).toEqual(OpenSSL.SSL.VERIFY_PEER);
  });

  it("build header hash ignores toplevel headers constant", () => {
    const top = TopLevel as Record<string, unknown>;
    delete top.Headers;
    const Bogus = class {};
    constSet(TopLevel, "Headers", Bogus);
    try {
      const result = Proxy.buildHeaderHash([["X-Test", "value"]]);
      expect(result.constructor, "build_header_hash leaked into top-level ::Headers").not.toBe(
        Bogus,
      );
    } finally {
      delete top.Headers;
    }
  });
});
