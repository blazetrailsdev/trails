import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";

import { Base } from "../../base.js";
import { LookupContext } from "../../lookup-context.js";
import { formWithGeneratesIds, setFormWithGeneratesIds } from "../../helpers/form-helper.js";
import { defaultEnforceUtf8, setDefaultEnforceUtf8 } from "../../helpers/form-tag-helper.js";
import { urlFor } from "../../helpers/url-helper.js";

function normalizeDom(html: string): string {
  return html
    .replace(/<\/form>$/, "")
    .replace(/<([a-z]+)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g, (_m, name, attrs) => {
      const list = (attrs.match(/[^\s=]+(?:=(?:"[^"]*"|'[^']*'))?/g) ?? []).map((a: string) =>
        a.replace(/='([^']*)'$/, '="$1"'),
      );
      return `<${name} ${list.sort().join(" ")}>`;
    });
}

function assertDomEqual(expected: string, actual: unknown): void {
  expect(normalizeDom(String(actual))).toBe(normalizeDom(expected));
}

function withDefaultEnforceUtf8(value: boolean, block: () => void): void {
  const oldValue = defaultEnforceUtf8;
  setDefaultEnforceUtf8(value);
  try {
    block();
  } finally {
    setDefaultEnforceUtf8(oldValue);
  }
}

function buildView(): Base {
  const view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
  view.urlFor = function (this: Base, options: unknown): string {
    if (options != null && typeof options === "object" && !Array.isArray(options)) {
      return "http://www.example.com";
    }
    return urlFor.call(this, options);
  } as typeof view.urlFor;
  return view;
}

let oldValue: boolean;
beforeEach(() => {
  oldValue = formWithGeneratesIds;
  setFormWithGeneratesIds(true);
});
afterEach(() => {
  setFormWithGeneratesIds(oldValue);
});

describe("FormWithActsLikeFormTagTest", () => {
  let view: Base;
  beforeEach(() => {
    view = buildView();
  });

  function hiddenFields(options: { method?: string; skipEnforcingUtf8?: boolean } = {}): string {
    const method = options.method;
    const skipEnforcingUtf8 = options.skipEnforcingUtf8 ?? false;
    let txt = "";
    if (!skipEnforcingUtf8) {
      txt += `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;
    }
    if (method && !["get", "post"].includes(method)) {
      txt += `<input name="_method" type="hidden" value="${method}" autocomplete="off" />`;
    }
    return txt;
  }

  function formText(
    action: string | false = "http://www.example.com",
    {
      local = false,
      ...options
    }: {
      local?: boolean;
      enctype?: boolean;
      htmlClass?: string;
      id?: string;
      method?: string;
    } = {},
  ): string {
    const { enctype, htmlClass, id } = options;
    const method = options.method === "get" ? "get" : "post";
    let txt = `<form accept-charset="UTF-8"` + (action ? ` action="${action}"` : "");
    if (enctype) txt += ` enctype="multipart/form-data"`;
    if (!local) txt += ` data-remote="true"`;
    if (htmlClass) txt += ` class="${htmlClass}"`;
    if (id) txt += ` id="${id}"`;
    return txt + ` method="${method}">`;
  }

  function wholeForm(
    action: string | false = "http://www.example.com",
    options: {
      local?: boolean;
      enctype?: boolean;
      method?: string;
      skipEnforcingUtf8?: boolean;
    } = {},
    block?: () => string,
  ): string {
    let out = formText(action, options) + hiddenFields(options);
    if (block) out += block() + "</form>";
    return out;
  }

  it("form with multipart", () => {
    const actual = view.formWith({ multipart: true });
    const expected = wholeForm("http://www.example.com", { enctype: true });
    assertDomEqual(expected, actual);
  });

  it("form with with method patch", () => {
    const actual = view.formWith({ method: "patch" });
    const expected = wholeForm("http://www.example.com", { method: "patch" });
    assertDomEqual(expected, actual);
  });

  it("form with with method put", () => {
    const actual = view.formWith({ method: "put" });
    const expected = wholeForm("http://www.example.com", { method: "put" });
    assertDomEqual(expected, actual);
  });

  it("form with with method delete", () => {
    const actual = view.formWith({ method: "delete" });
    const expected = wholeForm("http://www.example.com", { method: "delete" });
    assertDomEqual(expected, actual);
  });

  it("form with false url", () => {
    const actual = view.formWith({ url: false });
    const expected = wholeForm(false);
    assertDomEqual(expected, actual);
  });

  it("form with false action", () => {
    const actual = view.formWith({ html: { action: false } });
    const expected = wholeForm(false);
    assertDomEqual(expected, actual);
  });

  it("form with with local true", () => {
    const actual = view.formWith({ local: true });
    const expected = wholeForm("http://www.example.com", { local: true });
    assertDomEqual(expected, actual);
  });

  it("form with skip enforcing utf8 true", () => {
    const actual = view.formWith({ skipEnforcingUtf8: true });
    const expected = wholeForm("http://www.example.com", { skipEnforcingUtf8: true });
    assertDomEqual(expected, actual);
    expect(actual.htmlSafe).toBe(true);
  });

  it("form with default enforce utf8 false", () => {
    withDefaultEnforceUtf8(false, () => {
      const actual = view.formWith();
      const expected = wholeForm("http://www.example.com", { skipEnforcingUtf8: true });
      assertDomEqual(expected, actual);
      expect(actual.htmlSafe).toBe(true);
    });
  });

  it("form with default enforce utf8 true", () => {
    withDefaultEnforceUtf8(true, () => {
      const actual = view.formWith();
      const expected = wholeForm("http://www.example.com", { skipEnforcingUtf8: false });
      assertDomEqual(expected, actual);
      expect(actual.htmlSafe).toBe(true);
    });
  });

  it("form with with block in tse", () => {
    const rendered = view.render({
      inline: "<%= formWith({ url: 'http://www.example.com' }, () => { %>Hello world!<% }) %>",
    });
    const expected = wholeForm("http://www.example.com", {}, () => "Hello world!");
    assertDomEqual(expected, rendered);
  });
});

class Post {
  static modelName = { paramKey: "post" };
  get modelName(): typeof Post.modelName {
    return Post.modelName;
  }
  isPersisted(): boolean {
    return false;
  }
  toModel(): this {
    return this;
  }
}

describe("FormWithActsLikeFormForTest", () => {
  let view: Base;
  let rendered: unknown;

  function formWith(...args: Parameters<Base["formWith"]>): unknown {
    return (rendered = view.formWith(...args));
  }

  beforeEach(() => {
    view = buildView();
  });

  function wholeForm(action: string | false = "/"): string {
    const txt = `<form accept-charset="UTF-8"` + (action ? ` action="${action}"` : "");
    const utf8 = `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;
    return txt + ` data-remote="true" method="post">` + utf8 + "</form>";
  }

  it("form with when given nil model argument", () => {
    expect(() => formWith({ model: null }, () => {})).toThrow(ArgumentError);
  });

  it("form with false url", () => {
    formWith({ url: false });
    assertDomEqual(wholeForm(false), rendered);
  });

  it("form with model and false url", () => {
    formWith({ model: new Post(), url: false });
    assertDomEqual(wholeForm(false), rendered);
  });
});
