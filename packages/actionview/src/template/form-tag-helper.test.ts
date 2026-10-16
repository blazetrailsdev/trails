import { beforeEach, describe, it } from "vitest";
import { assertMatch, assertPredicate, isHtmlSafe } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { assertDomEqual } from "../testing/dom-assertions.js";
import { defaultEnforceUtf8, setDefaultEnforceUtf8 } from "../helpers/form-tag-helper.js";
import { raw } from "../helpers/output-safety-helper.js";

const renderErb = (string: string): string => {
  const template = new Template(
    string.trim(),
    "test template",
    TemplateHandlers.handlerForExtension("tse")!,
    { format: ":html", locals: [] },
  );
  const view = Base.withEmptyTemplateCache();
  return String(template.render(view.empty(), {})).trim();
};

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
    block?: () => string,
  ): string {
    let out = formText(action, options) + hiddenFields(options);

    if (block !== undefined) {
      out += block() + "</form>";
    }

    return out;
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

  it("checkbox tag", () => {
    const actual = view.checkboxTag("admin");
    const expected = `<input id="admin" name="admin" type="checkbox" value="1" />`;
    assertDomEqual(expected, actual);
  });

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

  it("form tag enforce utf8 true", () => {
    stubUrlFor();
    const actual = view.formTag({}, { enforceUtf8: true });
    const expected = wholeForm("http://www.example.com", { enforceUtf8: true });
    assertDomEqual(expected, actual);
    assertPredicate(actual, isHtmlSafe);
  });

  it("form tag enforce utf8 false", () => {
    stubUrlFor();
    const actual = view.formTag({}, { enforceUtf8: false });
    const expected = wholeForm("http://www.example.com", { enforceUtf8: false });
    assertDomEqual(expected, actual);
    assertPredicate(actual, isHtmlSafe);
  });

  it("form tag default enforce utf8 false", () => {
    stubUrlFor();
    withDefaultEnforceUtf8(false, () => {
      const actual = view.formTag({});
      const expected = wholeForm("http://www.example.com", { enforceUtf8: false });
      assertDomEqual(expected, actual);
      assertPredicate(actual, isHtmlSafe);
    });
  });

  it("form tag default enforce utf8 true", () => {
    stubUrlFor();
    withDefaultEnforceUtf8(true, () => {
      const actual = view.formTag({});
      const expected = wholeForm("http://www.example.com", { enforceUtf8: true });
      assertDomEqual(expected, actual);
      assertPredicate(actual, isHtmlSafe);
    });
  });

  it("form tag with block in tse", () => {
    const outputBuffer = renderErb(
      `<%= formTag("http://www.example.com", {}, () => { %>Hello world!<% }) %>`,
    );

    const expected = wholeForm(undefined, {}, () => "Hello world!");
    assertDomEqual(expected, outputBuffer);
  });

  it("form tag with block and method in tse", () => {
    const outputBuffer = renderErb(
      `<%= formTag("http://www.example.com", { method: "put" }, () => { %>Hello world!<% }) %>`,
    );

    const expected = wholeForm("http://www.example.com", { method: "put" }, () => {
      return "Hello world!";
    });

    assertDomEqual(expected, outputBuffer);
  });

  it("hidden field tag", () => {
    const actual = view.hiddenFieldTag("id", 3);
    const expected = `<input id="id" name="id" type="hidden" value="3" autocomplete="off" />`;
    assertDomEqual(expected, actual);
  });

  it("radio button tag", () => {
    let actual = view.radioButtonTag("people", "david");
    let expected = `<input id="people_david" name="people" type="radio" value="david" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("num_people", 5);
    expected = `<input id="num_people_5" name="num_people" type="radio" value="5" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("gender", "m").plus(view.radioButtonTag("gender", "f"));
    expected = `<input id="gender_m" name="gender" type="radio" value="m" /><input id="gender_f" name="gender" type="radio" value="f" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("opinion", "-1").plus(view.radioButtonTag("opinion", "1"));
    expected = `<input id="opinion_-1" name="opinion" type="radio" value="-1" /><input id="opinion_1" name="opinion" type="radio" value="1" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("person[gender]", "m");
    expected = `<input id="person_gender_m" name="person[gender]" type="radio" value="m" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("ctrlname", "apache2.2");
    expected = `<input id="ctrlname_apache2.2" name="ctrlname" type="radio" value="apache2.2" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("people", "david", true);
    expected = `<input id="people_david" name="people" type="radio" value="david" checked="checked" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("people", "david", false);
    expected = `<input id="people_david" name="people" type="radio" value="david" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("people", "david", false, { disabled: true });
    expected = `<input id="people_david" name="people" type="radio" value="david" disabled="disabled" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("people", "david", { checked: true });
    expected = `<input id="people_david" name="people" type="radio" value="david" checked="checked" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("people", "david", { checked: false });
    expected = `<input id="people_david" name="people" type="radio" value="david" />`;
    assertDomEqual(expected, actual);

    actual = view.radioButtonTag("people", "david", { checked: false, disabled: true });
    expected = `<input id="people_david" name="people" type="radio" value="david" disabled="disabled" />`;
    assertDomEqual(expected, actual);
  });

  it("select tag", () => {
    const actual = view.selectTag("people", raw("<option>david</option>"));
    const expected = `<select id="people" name="people"><option>david</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("text field tag", () => {
    const actual = view.textFieldTag("title", "Hello!");
    const expected = `<input id="title" name="title" type="text" value="Hello!" />`;
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

  it("button tag", () => {
    assertDomEqual(`<button name="button" type="submit">Button</button>`, view.buttonTag());
  });

  it("number field tag", () => {
    const expected = `<input name="quantity" max="9" id="quantity" type="number" min="1" />`;
    assertDomEqual(expected, view.numberFieldTag("quantity", null, { in: new Range(1, 10, true) }));
  });
});
