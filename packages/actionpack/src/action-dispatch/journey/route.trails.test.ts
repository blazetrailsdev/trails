import { describe, it, expect } from "vitest";
import { Parser } from "./parser.js";
import { Ast } from "./ast.js";
import { Pattern } from "./path/pattern.js";
import { Route, VerbMatchers } from "./route.js";

const SEPARATORS = "/.?";

function buildPath(
  path: string,
  requirements: Record<string, RegExp | RegExp[]> = {},
  separators: string = SEPARATORS,
  anchored = true,
): Pattern {
  const tree = new Parser().parse(path);
  const ast = new Ast(tree, true);
  return new Pattern(ast, requirements, separators, anchored);
}

function pathFromString(p: string) {
  return buildPath(p);
}

describe("ActionDispatch::Journey::Route", () => {
  it("VerbMatchers.for resolves canonical and lowercase forms", () => {
    expect(VerbMatchers.for("GET").verb).toBe("GET");
    expect(VerbMatchers.for("get").verb).toBe("GET");
    expect(VerbMatchers.for("all").verb).toBe("");
  });

  it("VerbMatchers.for returns an Unknown matcher for novel verbs", () => {
    const m = VerbMatchers.for("propfind");
    expect(m.verb).toBe("PROPFIND");
    expect(m.call({ requestMethod: "PROPFIND" })).toBe(true);
    expect(m.call({ requestMethod: "GET" })).toBe(false);
  });

  it("matches() honors request_method_match and constraints", () => {
    const route = new Route({
      name: "name",
      path: pathFromString("/posts"),
      requestMethodMatch: [VerbMatchers.for("GET")],
      constraints: { subdomain: "api" },
    });
    expect(route.matches({ requestMethod: "GET", subdomain: "api" })).toBe(true);
    expect(route.matches({ requestMethod: "POST", subdomain: "api" })).toBe(false);
    expect(route.matches({ requestMethod: "GET", subdomain: "www" })).toBe(false);
  });

  it("matches() supports regex / array / boolean constraint shapes", () => {
    const route = new Route({
      name: "name",
      path: pathFromString("/posts"),
      constraints: {
        subdomain: /^api$/,
        format: ["json", "xml"],
        signedIn: true,
      },
    });
    expect(
      route.matches({ requestMethod: "GET", subdomain: "api", format: "json", signedIn: 1 }),
    ).toBe(true);
    expect(
      route.matches({ requestMethod: "GET", subdomain: "www", format: "json", signedIn: 1 }),
    ).toBe(false);
    expect(
      route.matches({ requestMethod: "GET", subdomain: "api", format: "csv", signedIn: 1 }),
    ).toBe(false);
    expect(
      route.matches({ requestMethod: "GET", subdomain: "api", format: "json", signedIn: false }),
    ).toBe(false);
  });

  it("verb getter joins all request_method_match verbs with |", () => {
    const route = new Route({
      name: "name",
      path: pathFromString("/posts"),
      requestMethodMatch: [VerbMatchers.for("GET"), VerbMatchers.for("POST")],
    });
    expect(route.verb).toBe("GET|POST");
  });

  it("isRequiresMatchingVerb is false when only the ALL matcher is present", () => {
    const route = new Route({ name: "name", path: pathFromString("/posts") });
    expect(route.isRequiresMatchingVerb()).toBe(false);
  });
});
