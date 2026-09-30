import { beforeEach, describe, it } from "vitest";
import { assertMatch } from "@blazetrails/activesupport";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

describe("FormTagHelperTest", () => {
  const VALID_HTML_ID = /^[A-Za-z][-_:.A-Za-z0-9]*$/;

  let view: Base;
  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null);
  });

  function rootElem(renderedContent: unknown): Record<string, string> {
    const tag = /^\s*<[^\s>]+([^>]*)>/.exec(String(renderedContent))?.[1] ?? "";
    return Object.fromEntries(
      Array.from(tag.matchAll(/([^\s=]+)="([^"]*)"/g), ([, name, value]) => [name, value]),
    );
  }

  it("label tag without text", () => {
    const actual = view.labelTag("title");
    const expected = `<label for="title">Title</label>`;
    assertDomEqual(expected, actual);
  });

  it("label tag with symbol", () => {
    const actual = view.labelTag("title");
    const expected = `<label for="title">Title</label>`;
    assertDomEqual(expected, actual);
  });

  it("label tag with text", () => {
    const actual = view.labelTag("title", "My Title");
    const expected = `<label for="title">My Title</label>`;
    assertDomEqual(expected, actual);
  });

  it("label tag class string", () => {
    const actual = view.labelTag("title", "My Title", { class: "small_label" });
    const expected = `<label for="title" class="small_label">My Title</label>`;
    assertDomEqual(expected, actual);
  });

  it("label tag id sanitized", () => {
    const labelElem = rootElem(view.labelTag("item[title]"));
    assertMatch(VALID_HTML_ID, labelElem["for"]);
  });

  it("label tag with block", () => {
    assertDomEqual(
      "<label>Blocked</label>",
      view.labelTag(null, null, null, () => "Blocked"),
    );
  });

  it("label tag with block and argument", () => {
    const output = view.labelTag("clock", null, null, () => "Grandfather");
    assertDomEqual('<label for="clock">Grandfather</label>', output);
  });

  it("label tag with block and argument and options", () => {
    const output = view.labelTag("clock", { id: "label_clock" }, null, () => "Grandfather");
    assertDomEqual('<label for="clock" id="label_clock">Grandfather</label>', output);
  });
});
