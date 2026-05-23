import { describe, it, expect } from "vitest";
import {
  determineTemplateEtag,
  lookupAndDigestTemplate,
  pickTemplateForEtag,
  templateEtagger,
} from "./etag-with-template-digest.js";

describe("pickTemplateForEtag", () => {
  it("returns template from options when provided", () => {
    expect(pickTemplateForEtag({ template: "posts/show" }, {})).toBe("posts/show");
  });

  it("returns undefined when template is false", () => {
    expect(pickTemplateForEtag({ template: false }, { actionName: "show" })).toBeUndefined();
  });

  it("falls back to controller actionName when template not in options", () => {
    expect(pickTemplateForEtag({}, { actionName: "index" })).toBe("index");
  });

  it("returns undefined when no options and no actionName", () => {
    expect(pickTemplateForEtag(undefined, {})).toBeUndefined();
  });
});

describe("lookupAndDigestTemplate", () => {
  it("returns digest from lookupContext.digestFor", () => {
    const ctx = { digestFor: (_t: string) => "abc123" };
    expect(lookupAndDigestTemplate("show", ctx)).toBe("abc123");
  });

  it("returns undefined when digestFor returns null", () => {
    const ctx = { digestFor: (_t: string) => null };
    expect(lookupAndDigestTemplate("show", ctx)).toBeUndefined();
  });

  it("returns undefined when digestFor is not present", () => {
    expect(lookupAndDigestTemplate("show", {})).toBeUndefined();
  });
});

describe("determineTemplateEtag", () => {
  it("returns template digest when template resolved and context has digestFor", () => {
    const ctx = { digestFor: (t: string) => `digest-${t}` };
    expect(determineTemplateEtag({ template: "posts/show" }, {}, ctx)).toBe("digest-posts/show");
  });

  it("returns undefined when template is false", () => {
    const ctx = { digestFor: () => "should-not-be-called" };
    expect(determineTemplateEtag({ template: false }, { actionName: "show" }, ctx)).toBeUndefined();
  });

  it("uses actionName when no template option", () => {
    const ctx = { digestFor: (t: string) => `digest-${t}` };
    expect(determineTemplateEtag(undefined, { actionName: "index" }, ctx)).toBe("digest-index");
  });

  it("returns undefined when no template and no actionName", () => {
    const ctx = { digestFor: () => "x" };
    expect(determineTemplateEtag(undefined, {}, ctx)).toBeUndefined();
  });
});

describe("templateEtagger", () => {
  it("returns undefined when no lookupContext", () => {
    expect(templateEtagger({ actionName: "show" }, undefined)).toBeUndefined();
  });

  it("returns template digest via lookupContext", () => {
    const ctx = { digestFor: (t: string) => `d-${t}` };
    expect(templateEtagger({ actionName: "show" }, ctx)).toBe("d-show");
  });

  it("uses options.template over actionName", () => {
    const ctx = { digestFor: (t: string) => `d-${t}` };
    expect(templateEtagger({ actionName: "show" }, ctx, { template: "posts/show" })).toBe(
      "d-posts/show",
    );
  });
});
