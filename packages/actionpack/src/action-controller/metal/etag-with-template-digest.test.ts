import { beforeAll, describe, it, expect } from "vitest";
import { FixtureResolver, LookupContext, TemplateHandlers } from "@blazetrails/actionview";
import {
  determineTemplateEtag,
  lookupAndDigestTemplate,
  pickTemplateForEtag,
} from "./etag-with-template-digest.js";

function controller(actionName: string) {
  const prefixes = ["posts"];
  return {
    actionName,
    lookupContext: new LookupContext(
      [new FixtureResolver({ "posts/show.html.html": "show", "posts/index.html.html": "index" })],
      {},
      prefixes,
    ),
    _prefixes: () => prefixes,
  };
}

beforeAll(() => {
  TemplateHandlers.registerTemplateHandler("html", {
    call: (_template: unknown, source: string) => `return ${JSON.stringify(source)};`,
  });
});

describe("pickTemplateForEtag", () => {
  it("returns template from options when provided", () => {
    expect(pickTemplateForEtag.call(controller("show"), { template: "posts/index" })).toBe(
      "posts/index",
    );
  });

  it("returns undefined when template is false", () => {
    expect(pickTemplateForEtag.call(controller("show"), { template: false })).toBeUndefined();
  });

  it("falls back to the action template's virtual path", () => {
    expect(pickTemplateForEtag.call(controller("index"), {})).toBe("posts/index");
  });

  it("returns undefined when the action has no template", () => {
    expect(pickTemplateForEtag.call(controller("missing"), {})).toBeUndefined();
  });
});

describe("lookupAndDigestTemplate", () => {
  it("digests the template through the Digestor", () => {
    const host = controller("show");
    const digest = lookupAndDigestTemplate.call(host, "posts/show");
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
    expect(digest).not.toBe(lookupAndDigestTemplate.call(host, "posts/index"));
  });
});

describe("determineTemplateEtag", () => {
  it("returns the digest of the template option", () => {
    const host = controller("show");
    expect(determineTemplateEtag.call(host, { template: "posts/index" })).toBe(
      lookupAndDigestTemplate.call(host, "posts/index"),
    );
  });

  it("returns undefined when template is false", () => {
    expect(determineTemplateEtag.call(controller("show"), { template: false })).toBeUndefined();
  });

  it("uses the action template when no template option", () => {
    const host = controller("index");
    expect(determineTemplateEtag.call(host, {})).toBe(
      lookupAndDigestTemplate.call(host, "posts/index"),
    );
  });

  it("returns undefined when the action has no template", () => {
    expect(determineTemplateEtag.call(controller("missing"), {})).toBeUndefined();
  });
});
