import { describe, expect, it } from "vitest";
import { toQuery } from "../../index.js";
import { htmlSafe } from "../string/output-safety.js";

describe("ToQueryTest", () => {
  function assertQueryEqual(expected: string, actual: Parameters<typeof toQuery>[0]) {
    expect(toQuery(actual).split("&")).toEqual(expected.split("&"));
  }

  it("simple conversion", () => {
    assertQueryEqual("a=10", { a: 10 });
  });

  it("cgi escaping", () => {
    assertQueryEqual("a%3Ab=c+d", { "a:b": "c d" });
  });

  it("html safe parameter key", () => {
    assertQueryEqual("a%3Ab=c+d", new Map([[htmlSafe("a:b"), "c d"]]));
  });

  it("html safe parameter value", () => {
    assertQueryEqual("a=%5B10%5D", { a: htmlSafe("[10]") });
  });

  it("nil parameter value", () => {
    const empty = new (class {
      toParam() {
        return null;
      }
    })();
    assertQueryEqual("a=", { a: empty });
  });

  it("nested conversion", () => {
    assertQueryEqual("person%5Blogin%5D=seckar&person%5Bname%5D=Nicholas", {
      person: { login: "seckar", name: "Nicholas" },
    });
  });

  it("multiple nested", () => {
    assertQueryEqual("account%5Bperson%5D%5Bid%5D=20&person%5Bid%5D=10", {
      account: { person: { id: 20 } },
      person: { id: 10 },
    });
  });

  it("array values", () => {
    assertQueryEqual("person%5Bid%5D%5B%5D=10&person%5Bid%5D%5B%5D=20", {
      person: { id: [10, 20] },
    });
  });

  it("array values are not sorted", () => {
    assertQueryEqual("person%5Bid%5D%5B%5D=20&person%5Bid%5D%5B%5D=10", {
      person: { id: [20, 10] },
    });
  });

  it("empty array", () => {
    expect(toQuery([], "person")).toEqual("person%5B%5D=");
  });

  it("nested empty hash", () => {
    expect(toQuery({})).toEqual("");
    assertQueryEqual("a=1&b%5Bc%5D=3", { a: 1, b: { c: 3, d: {} } });
    assertQueryEqual("", { a: { b: { c: {} } } });
    assertQueryEqual("b%5Bc%5D=false&b%5Be%5D=&b%5Bf%5D=&p=12", {
      p: 12,
      b: { c: false, e: null, f: "" },
    });
    assertQueryEqual("b%5Bc%5D=3&b%5Bf%5D=", { b: { c: 3, k: {}, f: "" } });
    assertQueryEqual("b=3", { a: [], b: 3 });
  });

  it("hash with namespace", () => {
    const hash = { name: "Nakshay", nationality: "Indian" };
    expect(toQuery(hash, "user")).toEqual("user%5Bname%5D=Nakshay&user%5Bnationality%5D=Indian");
  });

  it("hash sorted lexicographically", () => {
    const hash = { type: "human", name: "Nakshay" };
    expect(toQuery(hash)).toEqual("name=Nakshay&type=human");
  });

  it("hash not sorted lexicographically for nested structure", () => {
    const params = {
      foo: {
        contents: [
          { name: "gorby", id: "123" },
          { name: "puff", d: "true" },
        ],
      },
    };
    const expected =
      "foo[contents][][name]=gorby&foo[contents][][id]=123&foo[contents][][name]=puff&foo[contents][][d]=true";

    expect(decodeURIComponent(toQuery(params).replace(/\+/g, " "))).toEqual(expected);
  });
});
