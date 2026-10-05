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

  function hiddenFields(options: { method?: string; enforceUtf8?: boolean } = {}): string {
    const method = options.method;
    const enforceUtf8 = options.enforceUtf8 ?? true;

    let txt = "";
    if (enforceUtf8) {
      txt += `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />`;
    }

    if (method != null && !["get", "post"].includes(String(method))) {
      txt += `<input name="_method" type="hidden" value="${method}" autocomplete="off" />`;
    }
    return txt;
  }

  function formText(
    action: string | false = "http://www.example.com",
    options: { remote?: boolean; enctype?: boolean; method?: string } = {},
  ): string {
    const { remote, enctype } = options;

    const method = String(options.method) === "get" ? "get" : "post";

    let txt = `<form accept-charset="UTF-8"` + (action !== false ? ` action="${action}"` : "");
    if (enctype) txt += ` enctype="multipart/form-data"`;
    if (remote) txt += ` data-remote="true"`;
    txt += ` method="${method}">`;
    return txt;
  }

  function wholeForm(
    action: string | false = "http://www.example.com",
    options: { remote?: boolean; enctype?: boolean; method?: string; enforceUtf8?: boolean } = {},
  ): string {
    return formText(action, options) + hiddenFields(options);
  }

  function stubUrlFor(): void {
    const urlFor = view.urlFor;
    view.urlFor = function (this: Base, options: unknown) {
      if (options !== null && typeof options === "object") {
        return "http://www.example.com";
      } else {
        return urlFor.call(this, options as never);
      }
    } as typeof view.urlFor;
  }

  it("form tag", () => {
    stubUrlFor();
    const actual = view.formTag();
    const expected = wholeForm();
    assertDomEqual(expected, actual);
  });

  it("form tag multipart", () => {
    stubUrlFor();
    const actual = view.formTag({}, { multipart: true });
    const expected = wholeForm("http://www.example.com", { enctype: true });
    assertDomEqual(expected, actual);
  });

  it("form tag with method patch", () => {
    stubUrlFor();
    const actual = view.formTag({}, { method: "patch" });
    const expected = wholeForm("http://www.example.com", { method: "patch" });
    assertDomEqual(expected, actual);
  });

  it("form tag with method put", () => {
    stubUrlFor();
    const actual = view.formTag({}, { method: "put" });
    const expected = wholeForm("http://www.example.com", { method: "put" });
    assertDomEqual(expected, actual);
  });

  it("form tag with method delete", () => {
    stubUrlFor();
    const actual = view.formTag({}, { method: "delete" });

    const expected = wholeForm("http://www.example.com", { method: "delete" });
    assertDomEqual(expected, actual);
  });

  it("form tag with remote", () => {
    stubUrlFor();
    const actual = view.formTag({}, { remote: true });

    const expected = wholeForm("http://www.example.com", { remote: true });
    assertDomEqual(expected, actual);
  });

  it("form tag with remote false", () => {
    stubUrlFor();
    const actual = view.formTag({}, { remote: false });

    const expected = wholeForm();
    assertDomEqual(expected, actual);
  });

  it("form tag with false url for options", () => {
    const actual = view.formTag(false);

    const expected = wholeForm(false);
    assertDomEqual(expected, actual);
  });

  it("form tag with false action", () => {
    stubUrlFor();
    const actual = view.formTag({}, { action: false });

    const expected = wholeForm(false);
    assertDomEqual(expected, actual);
  });

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
