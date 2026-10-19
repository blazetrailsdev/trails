import { beforeEach, describe, it } from "vitest";
import { assertEqual, assertMatch, assertPredicate, isHtmlSafe } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { Template } from "../template.js";
import { TemplateHandlers } from "./handlers.js";
import { assertDomEqual } from "../testing/dom-assertions.js";
import { defaultEnforceUtf8, setDefaultEnforceUtf8 } from "../helpers/form-tag-helper.js";
import { raw } from "../helpers/output-safety-helper.js";
import {
  prependContentExfiltrationPrevention,
  setPrependContentExfiltrationPrevention,
} from "../helpers/content-exfiltration-prevention-helper.js";

const renderErb = async (string: string): Promise<string> => {
  const template = new Template(
    string.trim(),
    "test template",
    TemplateHandlers.handlerForExtension("tse")!,
    { format: ":html", locals: [] },
  );
  const view = Base.withEmptyTemplateCache();
  return String(await template.render(view.empty(), {})).trim();
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

  function withPrependContentExfiltrationPrevention(value: boolean, block: () => void): void {
    const oldValue = prependContentExfiltrationPrevention;
    setPrependContentExfiltrationPrevention(value);
    try {
      block();
    } finally {
      setPrependContentExfiltrationPrevention(oldValue);
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

  it("checkbox tag disabled", () => {
    const actual = view.checkboxTag("admin", "1", false, { disabled: true });
    const expected = `<input id="admin" disabled="disabled" name="admin" type="checkbox" value="1" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag default checked", () => {
    const actual = view.checkboxTag("admin", "1", true);
    const expected = `<input id="admin" checked="checked" name="admin" type="checkbox" value="1" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag checked kwarg true", () => {
    const actual = view.checkboxTag("admin", "yes", { checked: true });
    const expected = `<input id="admin" checked="checked" name="admin" type="checkbox" value="yes" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag checked kwarg false", () => {
    const actual = view.checkboxTag("admin", "1", { checked: false });
    const expected = `<input id="admin" name="admin" type="checkbox" value="1" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag checked kwarg false and disabled", () => {
    const actual = view.checkboxTag("admin", "1", { checked: false, disabled: true });
    const expected = `<input id="admin" name="admin" type="checkbox" value="1" disabled="disabled" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag checked kwarg true value argument skipped", () => {
    const actual = view.checkboxTag("admin", { checked: true });
    const expected = `<input id="admin" checked="checked" name="admin" type="checkbox" value="1" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag value kwarg", () => {
    const actual = view.checkboxTag("admin", { value: "0", checked: true });
    const expected = `<input id="admin" name="admin" type="checkbox" value="0" checked="checked" />`;
    assertDomEqual(expected, actual);
  });

  it("checkbox tag id sanitized", () => {
    const labelElem = rootElem(view.checkboxTag("project[2][admin]"));
    assertMatch(VALID_HTML_ID, labelElem["id"]);
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

  it("form tag with block in tse", async () => {
    const outputBuffer = await renderErb(
      `<%= formTag("http://www.example.com", {}, () => { %>Hello world!<% }) %>`,
    );

    const expected = wholeForm(undefined, {}, () => "Hello world!");
    assertDomEqual(expected, outputBuffer);
  });

  it("form tag with block and method in tse", async () => {
    const outputBuffer = await renderErb(
      `<%= formTag("http://www.example.com", { method: "put" }, () => { %>Hello world!<% }) %>`,
    );

    const expected = wholeForm("http://www.example.com", { method: "put" }, () => {
      return "Hello world!";
    });

    assertDomEqual(expected, outputBuffer);
  });

  it("field id without suffixes or index", () => {
    const value = view.fieldId("post", "title");

    assertEqual("post_title", value);
  });

  it("field id with suffixes", () => {
    const value = view.fieldId("post", "title", "error");

    assertEqual("post_title_error", value);
  });

  it("field id with suffixes and index", () => {
    const value = view.fieldId("post", "title", "error", { index: 1 });

    assertEqual("post_1_title_error", value);
  });

  it("field id with nested object name", () => {
    const value = view.fieldId("post[author]", "name");

    assertEqual("post_author_name", value);
  });

  it("field name with nil object name", () => {
    const value = view.fieldName(null, "title");

    assertEqual("title", value);
  });

  it("field name with blank object name", () => {
    const value = view.fieldName("", "title");

    assertEqual("title", value);
  });

  it("field name without object name and multiple", () => {
    const value = view.fieldName("", "title", { multiple: true });

    assertEqual("title[]", value);
  });

  it("field name without method names or multiple or index", () => {
    const value = view.fieldName("post", "title");

    assertEqual("post[title]", value);
  });

  it("field name without method names and multiple", () => {
    const value = view.fieldName("post", "title", { multiple: true });

    assertEqual("post[title][]", value);
  });

  it("field name without method names and index", () => {
    const value = view.fieldName("post", "title", { index: 1 });

    assertEqual("post[1][title]", value);
  });

  it("field name without method names and index and multiple", () => {
    const value = view.fieldName("post", "title", { index: 1, multiple: true });

    assertEqual("post[1][title][]", value);
  });

  it("field name with method names", () => {
    const value = view.fieldName("post", "title", "subtitle");

    assertEqual("post[title][subtitle]", value);
  });

  it("field name with method names and index", () => {
    const value = view.fieldName("post", "title", "subtitle", { index: 1 });

    assertEqual("post[1][title][subtitle]", value);
  });

  it("field name with method names and multiple", () => {
    const value = view.fieldName("post", "title", "subtitle", { multiple: true });

    assertEqual("post[title][subtitle][]", value);
  });

  it("field name with method names and multiple and index", () => {
    const value = view.fieldName("post", "title", "subtitle", { index: 1, multiple: true });

    assertEqual("post[1][title][subtitle][]", value);
  });

  it("hidden field tag", () => {
    const actual = view.hiddenFieldTag("id", 3);
    const expected = `<input id="id" name="id" type="hidden" value="3" autocomplete="off" />`;
    assertDomEqual(expected, actual);
  });

  it("hidden field tag id sanitized", () => {
    const inputElem = rootElem(view.hiddenFieldTag("item[][title]"));
    assertMatch(VALID_HTML_ID, inputElem["id"]);
  });

  it("file field tag", () => {
    assertDomEqual(
      `<input name="picsplz" type="file" id="picsplz" />`,
      view.fileFieldTag("picsplz"),
    );
  });

  it("file field tag with options", () => {
    assertDomEqual(
      `<input name="picsplz" type="file" id="picsplz" class="pix"/>`,
      view.fileFieldTag("picsplz", { class: "pix" }),
    );
  });

  it("file field tag with direct upload when rails direct uploads url is not defined", () => {
    assertDomEqual(
      `<input name="picsplz" type="file" id="picsplz" class="pix"/>`,
      view.fileFieldTag("picsplz", { class: "pix", directUpload: true }),
    );
  });

  // BLOCKED: port-form-tag-helper-and-checkable-test-remainder
  it.skip("file field tag with direct upload when rails direct uploads url is defined", () => {});

  it("file field tag with direct upload dont mutate arguments", () => {
    const originalOptions = { class: "pix", directUpload: true };

    assertDomEqual(
      `<input name="picsplz" type="file" id="picsplz" class="pix"/>`,
      view.fileFieldTag("picsplz", originalOptions),
    );

    assertEqual({ class: "pix", directUpload: true }, originalOptions);
  });

  it("password field tag", () => {
    const actual = view.passwordFieldTag();
    const expected = `<input id="password" name="password" type="password" />`;
    assertDomEqual(expected, actual);
  });

  it("multiple field tags with same options", () => {
    const options = { class: "important" };
    assertDomEqual(
      `<input name="title" type="file" id="title" class="important"/>`,
      view.fileFieldTag("title", options),
    );
    assertDomEqual(
      `<input type="password" name="title" id="title" value="Hello!" class="important" />`,
      view.passwordFieldTag("title", "Hello!", options),
    );
    assertDomEqual(
      `<input type="text" name="title" id="title" value="Hello!" class="important" />`,
      view.textFieldTag("title", "Hello!", options),
    );
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

  it("select tag with multiple", () => {
    const actual = view.selectTag(
      "colors",
      raw("<option>Red</option><option>Blue</option><option>Green</option>"),
      { multiple: true },
    );
    const expected = `<select id="colors" multiple="multiple" name="colors[]"><option>Red</option><option>Blue</option><option>Green</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag disabled", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { disabled: true },
    );
    const expected = `<select id="places" disabled="disabled" name="places"><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag id sanitized", () => {
    const inputElem = rootElem(view.selectTag("project[1]people", "<option>david</option>"));
    assertMatch(VALID_HTML_ID, inputElem["id"]);
  });

  it("select tag with include blank", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { includeBlank: true },
    );
    const expected = `<select id="places" name="places"><option value="" label=" "></option><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag with include blank doesnt change options", () => {
    const options: Record<string, unknown> = { includeBlank: true, prompt: "string" };
    const expectedOptions = { ...options };
    view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      options,
    );
    for (const [k, v] of Object.entries(expectedOptions)) assertEqual(v, options[k]);
  });

  it("select tag with include blank false", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { includeBlank: false },
    );
    const expected = `<select id="places" name="places"><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag with include blank string", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { includeBlank: "Choose" },
    );
    const expected = `<select id="places" name="places"><option value="">Choose</option><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag with prompt", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { prompt: "string" },
    );
    const expected = `<select id="places" name="places"><option value="">string</option><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag escapes prompt", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { prompt: "<script>alert(1337)</script>" },
    );
    const expected = `<select id="places" name="places"><option value="">&lt;script&gt;alert(1337)&lt;/script&gt;</option><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag with prompt and include blank", () => {
    const actual = view.selectTag(
      "places",
      raw("<option>Home</option><option>Work</option><option>Pub</option>"),
      { prompt: "string", includeBlank: true },
    );
    const expected = `<select name="places" id="places"><option value="">string</option><option value="" label=" "></option><option>Home</option><option>Work</option><option>Pub</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag with nil option tags and include blank", () => {
    const actual = view.selectTag("places", null, { includeBlank: true });
    const expected = `<select id="places" name="places"><option value="" label=" "></option></select>`;
    assertDomEqual(expected, actual);
  });

  it("select tag with nil option tags and prompt", () => {
    const actual = view.selectTag("places", null, { prompt: "string" });
    const expected = `<select id="places" name="places"><option value="">string</option></select>`;
    assertDomEqual(expected, actual);
  });

  it("textarea tag size string", () => {
    const actual = view.textareaTag("body", "hello world", { size: "20x40" });
    const expected = `<textarea cols="20" id="body" name="body" rows="40">\nhello world</textarea>`;
    assertDomEqual(expected, actual);
  });

  it("textarea tag size symbol", () => {
    const actual = view.textareaTag("body", "hello world", { size: "20x40" });
    const expected = `<textarea cols="20" id="body" name="body" rows="40">\nhello world</textarea>`;
    assertDomEqual(expected, actual);
  });

  it("textarea tag should disregard size if its given as an integer", () => {
    const actual = view.textareaTag("body", "hello world", { size: 20 });
    const expected = `<textarea id="body" name="body">\nhello world</textarea>`;
    assertDomEqual(expected, actual);
  });

  it("textarea tag id sanitized", () => {
    const inputElem = rootElem(view.textareaTag("item[][description]"));
    assertMatch(VALID_HTML_ID, inputElem["id"]);
  });

  it("textarea tag escape content", () => {
    const actual = view.textareaTag("body", "<b>hello world</b>", { size: "20x40" });
    const expected = `<textarea cols="20" id="body" name="body" rows="40">\n&lt;b&gt;hello world&lt;/b&gt;</textarea>`;
    assertDomEqual(expected, actual);
  });

  it("textarea tag unescaped content", () => {
    const actual = view.textareaTag("body", "<b>hello world</b>", { size: "20x40", escape: false });
    const expected = `<textarea cols="20" id="body" name="body" rows="40">\n<b>hello world</b></textarea>`;
    assertDomEqual(expected, actual);
  });

  it("textarea tag unescaped nil content", () => {
    const actual = view.textareaTag("body", null, { escape: false });
    const expected = `<textarea id="body" name="body">\n</textarea>`;
    assertDomEqual(expected, actual);
  });

  it("text field tag", () => {
    const actual = view.textFieldTag("title", "Hello!");
    const expected = `<input id="title" name="title" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag class string", () => {
    const actual = view.textFieldTag("title", "Hello!", { class: "admin" });
    const expected = `<input class="admin" id="title" name="title" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag size symbol", () => {
    const actual = view.textFieldTag("title", "Hello!", { size: 75 });
    const expected = `<input id="title" name="title" size="75" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  // BLOCKED: port-form-tag-helper-and-checkable-test-remainder
  it.skip("text field tag with ac parameters", () => {});

  it("text field tag size string", () => {
    const actual = view.textFieldTag("title", "Hello!", { size: "75" });
    const expected = `<input id="title" name="title" size="75" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag maxlength symbol", () => {
    const actual = view.textFieldTag("title", "Hello!", { maxlength: 75 });
    const expected = `<input id="title" name="title" maxlength="75" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag maxlength string", () => {
    const actual = view.textFieldTag("title", "Hello!", { maxlength: "75" });
    const expected = `<input id="title" name="title" maxlength="75" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag disabled", () => {
    const actual = view.textFieldTag("title", "Hello!", { disabled: true });
    const expected = `<input id="title" name="title" disabled="disabled" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag with placeholder option", () => {
    const actual = view.textFieldTag("title", "Hello!", { placeholder: "Enter search term..." });
    const expected = `<input id="title" name="title" placeholder="Enter search term..." type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag with multiple options", () => {
    const actual = view.textFieldTag("title", "Hello!", { size: 70, maxlength: 80 });
    const expected = `<input id="title" name="title" size="70" maxlength="80" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("text field tag id sanitized", () => {
    const inputElem = rootElem(view.textFieldTag("item[][title]"));
    assertMatch(VALID_HTML_ID, inputElem["id"]);
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

  it("boolean options", () => {
    assertDomEqual(
      `<input checked="checked" disabled="disabled" id="admin" name="admin" readonly="readonly" type="checkbox" value="1" />`,
      view.checkboxTag("admin", 1, true, { disabled: true, readonly: "yes" }),
    );
    assertDomEqual(
      `<input checked="checked" id="admin" name="admin" type="checkbox" value="1" />`,
      view.checkboxTag("admin", 1, true, { disabled: false, readonly: null }),
    );
    assertDomEqual(
      `<input type="checkbox" />`,
      view.tag("input", { type: "checkbox", checked: false }),
    );
    assertDomEqual(
      `<select id="people" multiple="multiple" name="people[]"><option>david</option></select>`,
      view.selectTag("people", raw("<option>david</option>"), { multiple: true }),
    );
    assertDomEqual(
      `<select id="people_" multiple="multiple" name="people[]"><option>david</option></select>`,
      view.selectTag("people[]", raw("<option>david</option>"), { multiple: true }),
    );
    assertDomEqual(
      `<select id="people" name="people"><option>david</option></select>`,
      view.selectTag("people", raw("<option>david</option>"), { multiple: null }),
    );
  });

  it("stringify symbol keys", () => {
    const actual = view.textFieldTag("title", "Hello!", { id: "admin" });
    const expected = `<input id="admin" name="title" type="text" value="Hello!" />`;
    assertDomEqual(expected, actual);
  });

  it("submit tag", () => {
    assertDomEqual(
      `<input name='commit' data-disable-with="Saving..." onclick="alert(&#39;hello!&#39;)" type="submit" value="Save" />`,
      view.submitTag("Save", { onclick: "alert('hello!')", data: { disable_with: "Saving..." } }),
    );
  });

  it("empty submit tag", () => {
    assertDomEqual(
      `<input data-disable-with="Save" name='commit' type="submit" value="Save" />`,
      view.submitTag("Save"),
    );
  });

  it("empty submit tag with opt out", () => {
    Base.automaticallyDisableSubmitTag = false;
    try {
      assertDomEqual(`<input name='commit' type="submit" value="Save" />`, view.submitTag("Save"));
    } finally {
      Base.automaticallyDisableSubmitTag = true;
    }
  });

  it("empty submit tag with opt out and explicit disabling", () => {
    Base.automaticallyDisableSubmitTag = false;
    try {
      assertDomEqual(
        `<input name='commit' type="submit" value="Save" />`,
        view.submitTag("Save", { data: { disable_with: false } }),
      );
    } finally {
      Base.automaticallyDisableSubmitTag = true;
    }
  });

  it("submit tag having data disable with string", () => {
    assertDomEqual(
      `<input data-disable-with="Processing..." data-confirm="Are you sure?" name='commit' type="submit" value="Save" />`,
      view.submitTag("Save", {
        "data-disable-with": "Processing...",
        "data-confirm": "Are you sure?",
      }),
    );
  });

  it("submit tag having data disable with boolean", () => {
    assertDomEqual(
      `<input data-confirm="Are you sure?" name='commit' type="submit" value="Save" />`,
      view.submitTag("Save", { "data-disable-with": false, "data-confirm": "Are you sure?" }),
    );
  });

  it("submit tag having data hash disable with boolean", () => {
    assertDomEqual(
      `<input data-confirm="Are you sure?" name='commit' type="submit" value="Save" />`,
      view.submitTag("Save", { data: { confirm: "Are you sure?", disable_with: false } }),
    );
  });

  it("submit tag with no onclick options", () => {
    assertDomEqual(
      `<input name='commit' data-disable-with="Saving..." type="submit" value="Save" />`,
      view.submitTag("Save", { data: { disable_with: "Saving..." } }),
    );
  });

  it("submit tag with confirmation", () => {
    assertDomEqual(
      `<input name='commit' type='submit' value='Save' data-confirm="Are you sure?" data-disable-with="Save" />`,
      view.submitTag("Save", { data: { confirm: "Are you sure?" } }),
    );
  });

  it("submit tag doesnt have data disable with twice", () => {
    assertEqual(
      `<input type="submit" name="commit" value="Save" data-confirm="Are you sure?" data-disable-with="Processing..." />`,
      String(
        view.submitTag("Save", {
          "data-disable-with": "Processing...",
          "data-confirm": "Are you sure?",
        }),
      ),
    );
  });

  it("submit tag doesnt have data disable with twice with hash", () => {
    assertEqual(
      `<input type="submit" name="commit" value="Save" data-disable-with="Processing..." />`,
      String(view.submitTag("Save", { data: { disable_with: "Processing..." } })),
    );
  });

  it("submit tag with symbol value", () => {
    assertDomEqual(
      `<input data-disable-with="Save" name='commit' type="submit" value="Save" />`,
      view.submitTag("Save"),
    );
  });

  it("button tag", () => {
    assertDomEqual(`<button name="button" type="submit">Button</button>`, view.buttonTag());
  });

  it("button tag with submit type", () => {
    assertDomEqual(
      `<button name="button" type="submit">Save</button>`,
      view.buttonTag("Save", { type: "submit" }),
    );
  });

  it("button tag with button type", () => {
    assertDomEqual(
      `<button name="button" type="button">Button</button>`,
      view.buttonTag("Button", { type: "button" }),
    );
  });

  it("button tag with reset type", () => {
    assertDomEqual(
      `<button name="button" type="reset">Reset</button>`,
      view.buttonTag("Reset", { type: "reset" }),
    );
  });

  it("button tag with disabled option", () => {
    assertDomEqual(
      `<button name="button" type="reset" disabled="disabled">Reset</button>`,
      view.buttonTag("Reset", { type: "reset", disabled: true }),
    );
  });

  it("button tag escape content", () => {
    assertDomEqual(
      `<button name="button" type="reset" disabled="disabled">&lt;b&gt;Reset&lt;/b&gt;</button>`,
      view.buttonTag("<b>Reset</b>", { type: "reset", disabled: true }),
    );
  });

  it("button tag with block", () => {
    assertDomEqual(
      '<button name="button" type="submit">Content</button>',
      view.buttonTag(null, null, () => "Content"),
    );
  });

  it("button tag with block and options", () => {
    const output = view.buttonTag({ name: "temptation", type: "button" }, null, () =>
      view.contentTag("strong", "Do not press me"),
    );
    assertDomEqual(
      '<button name="temptation" type="button"><strong>Do not press me</strong></button>',
      output,
    );
  });

  it("button tag with confirmation", () => {
    assertDomEqual(
      `<button name="button" type="submit" data-confirm="Are you sure?">Save</button>`,
      view.buttonTag("Save", { type: "submit", data: { confirm: "Are you sure?" } }),
    );
  });

  it("button tag with data disable with option", () => {
    assertDomEqual(
      `<button name="button" type="submit" data-disable-with="Please wait...">Checkout</button>`,
      view.buttonTag("Checkout", { data: { disable_with: "Please wait..." } }),
    );
  });

  it("color field tag", () => {
    const expected = `<input id="car" name="car" type="color" />`;
    assertDomEqual(expected, view.colorFieldTag("car"));
  });

  it("search field tag", () => {
    const expected = `<input id="query" name="query" type="search" />`;
    assertDomEqual(expected, view.searchFieldTag("query"));
  });

  it("telephone field tag", () => {
    const expected = `<input id="cell" name="cell" type="tel" />`;
    assertDomEqual(expected, view.telephoneFieldTag("cell"));
  });

  it("date field tag", () => {
    const expected = `<input id="cell" name="cell" type="date" />`;
    assertDomEqual(expected, view.dateFieldTag("cell"));
  });

  it("time field tag", () => {
    const expected = `<input id="cell" name="cell" type="time" />`;
    assertDomEqual(expected, view.timeFieldTag("cell"));
  });

  it("datetime field tag", () => {
    const expected = `<input id="appointment" name="appointment" type="datetime-local" />`;
    assertDomEqual(expected, view.datetimeFieldTag("appointment"));
  });

  it("datetime local field tag", () => {
    const expected = `<input id="appointment" name="appointment" type="datetime-local" />`;
    assertDomEqual(expected, view.datetimeLocalFieldTag("appointment"));
  });

  it("month field tag", () => {
    const expected = `<input id="birthday" name="birthday" type="month" />`;
    assertDomEqual(expected, view.monthFieldTag("birthday"));
  });

  it("week field tag", () => {
    const expected = `<input id="birthday" name="birthday" type="week" />`;
    assertDomEqual(expected, view.weekFieldTag("birthday"));
  });

  it("url field tag", () => {
    const expected = `<input id="homepage" name="homepage" type="url" />`;
    assertDomEqual(expected, view.urlFieldTag("homepage"));
  });

  it("email field tag", () => {
    const expected = `<input id="address" name="address" type="email" />`;
    assertDomEqual(expected, view.emailFieldTag("address"));
  });

  it("number field tag", () => {
    const expected = `<input name="quantity" max="9" id="quantity" type="number" min="1" />`;
    assertDomEqual(expected, view.numberFieldTag("quantity", null, { in: new Range(1, 10, true) }));
  });

  it("range input tag", () => {
    const expected = `<input name="volume" step="0.1" max="11" id="volume" type="range" min="0" />`;
    assertDomEqual(
      expected,
      view.rangeFieldTag("volume", null, { in: new Range(0, 11), step: 0.1 }),
    );
  });

  it("field set tag in tse", async () => {
    let outputBuffer = await renderErb(
      `<%= fieldSetTag("Your details", null, () => { %>Hello world!<% }) %>`,
    );

    let expected = `<fieldset><legend>Your details</legend>Hello world!</fieldset>`;
    assertDomEqual(expected, outputBuffer);

    outputBuffer = await renderErb(`<%= fieldSetTag(null, null, () => { %>Hello world!<% }) %>`);

    expected = `<fieldset>Hello world!</fieldset>`;
    assertDomEqual(expected, outputBuffer);

    outputBuffer = await renderErb(`<%= fieldSetTag("", null, () => { %>Hello world!<% }) %>`);

    expected = `<fieldset>Hello world!</fieldset>`;
    assertDomEqual(expected, outputBuffer);

    outputBuffer = await renderErb(
      `<%= fieldSetTag("", { class: "format" }, () => { %>Hello world!<% }) %>`,
    );

    expected = `<fieldset class="format">Hello world!</fieldset>`;
    assertDomEqual(expected, outputBuffer);

    outputBuffer = await renderErb(
      `<%= fieldsetTag("", { class: "format" }, () => { %>Hello world!<% }) %>`,
    );

    expected = `<fieldset class="format">Hello world!</fieldset>`;
    assertDomEqual(expected, outputBuffer);

    outputBuffer = await renderErb(`<%= fieldSetTag() %>`);

    expected = `<fieldset></fieldset>`;
    assertDomEqual(expected, outputBuffer);

    outputBuffer = await renderErb(`<%= fieldSetTag("You legend!") %>`);

    expected = `<fieldset><legend>You legend!</legend></fieldset>`;
    assertDomEqual(expected, outputBuffer);
  });

  it("content exfiltration prevention", () => {
    withPrependContentExfiltrationPrevention(true, () => {
      stubUrlFor();
      const actual = view.formTag();
      const expected = `<!-- '"\` --><!-- </textarea></xmp> --></option></form>${wholeForm()}`;
      assertDomEqual(expected, actual);
    });
  });

  it("form with content exfiltration prevention is html safe", () => {
    withPrependContentExfiltrationPrevention(true, () => {
      stubUrlFor();
      assertEqual(true, isHtmlSafe(view.formTag()));
    });
  });
});
