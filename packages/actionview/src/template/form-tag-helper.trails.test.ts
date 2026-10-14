import { beforeEach, describe, expect, it } from "vitest";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";

describe("FormTagHelper#form_tag", () => {
  let view: Base;
  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
  });

  const open =
    `<form action="/posts" accept-charset="UTF-8" method="post">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;

  it("closes the form around a block's content", () => {
    const actual = view.formTag("/posts", {}, () => "Hello world!");
    expect(String(actual)).toBe(`${open}Hello world!</form>`);
    expect(actual.htmlSafe).toBe(true);
  });

  it("leaves the form open without a block", () => {
    expect(String(view.formTag("/posts"))).toBe(open);
    expect(String(view.formTag("/posts", {}, null))).toBe(open);
  });
});
