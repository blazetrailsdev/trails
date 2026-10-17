/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { beforeEach, describe, it } from "vitest";
import { assertMatch, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, Range, Struct } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

const Post = Struct.new(
  "title",
  "author_name",
  "body",
  "written_on",
  "category",
  "origin",
  "allow_comments",
);
const Continent = Struct.new("continent_name", "countries");

type View = Base & Record<string, any>;

describe("FormOptionsHelperTest", () => {
  let view: View;

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
  });

  const optionsForSelect = (...args: unknown[]) => view.optionsForSelect(...args);
  const select = (...args: unknown[]) => view.select(...args);

  it("array options for select", () => {
    assertDomEqual(
      '<option value="&lt;Denmark&gt;">&lt;Denmark&gt;</option>\n<option value="USA">USA</option>\n<option value="Sweden">Sweden</option>',
      optionsForSelect(["<Denmark>", "USA", "Sweden"]),
    );
  });

  it("array options for select with custom defined selected", () => {
    assertDomEqual(
      '<option selected="selected" type="Coach" value="1">Richard Bandler</option>\n<option type="Coachee" value="1">Richard Bandler</option>',
      optionsForSelect([
        ["Richard Bandler", 1, { type: "Coach", selected: "selected" }],
        ["Richard Bandler", 1, { type: "Coachee" }],
      ]),
    );
  });

  it("array options for select with selection", () => {
    assertDomEqual(
      '<option value="Denmark">Denmark</option>\n<option value="&lt;USA&gt;" selected="selected">&lt;USA&gt;</option>\n<option value="Sweden">Sweden</option>',
      optionsForSelect(["Denmark", "<USA>", "Sweden"], "<USA>"),
    );
  });

  it("range options for select", () => {
    assertDomEqual(
      '<option value="1">1</option>\n<option value="2">2</option>\n<option value="3">3</option>',
      optionsForSelect(new Range(1, 3)),
    );
  });

  it("hash options for select", () => {
    assertDomEqual(
      '<option value="Dollar">$</option>\n<option value="&lt;Kroner&gt;">&lt;DKR&gt;</option>',
      optionsForSelect({ $: "Dollar", "<DKR>": "<Kroner>" }),
    );
    assertDomEqual(
      '<option value="Dollar" selected="selected">$</option>\n<option value="&lt;Kroner&gt;" selected="selected">&lt;DKR&gt;</option>',
      optionsForSelect({ $: "Dollar", "<DKR>": "<Kroner>" }, ["Dollar", "<Kroner>"]),
    );
  });

  it("select", () => {
    view.post = new Post();
    view.post.category = "<mus>";
    assertDomEqual(
      '<select id="post_category" name="post[category]"><option value="abe">abe</option>\n<option value="&lt;mus&gt;" selected="selected">&lt;mus&gt;</option>\n<option value="hest">hest</option></select>',
      select("post", "category", ["abe", "<mus>", "hest"]),
    );
  });

  it("select with multiple to add hidden input", () => {
    assertDomEqual(
      '<input type="hidden" name="post[category][]" value="" autocomplete="off"/><select multiple="multiple" id="post_category" name="post[category][]"></select>',
      select("post", "category", "", {}, { multiple: true }),
    );
  });

  it("select with include blank false and required", async () => {
    view.post = new Post();
    view.post.category = "<mus>";
    const e = await assertRaises([ArgumentError], {}, () =>
      select(
        "post",
        "category",
        ["abe", "<mus>", "hest"],
        { includeBlank: false },
        { required: "required" },
      ),
    );
    assertMatch(/include_blank cannot be false for a required field./, e.message);
  });

  it("select with default prompt", () => {
    view.post = new Post();
    view.post.category = "";
    assertDomEqual(
      '<select id="post_category" name="post[category]"><option value="">Please select</option>\n<option value="abe">abe</option>\n<option value="&lt;mus&gt;">&lt;mus&gt;</option>\n<option value="hest">hest</option></select>',
      select("post", "category", ["abe", "<mus>", "hest"], { prompt: true }),
    );
  });

  it("select with array", () => {
    view.continent = new Continent();
    view.continent.countries = ["Africa", "Europe"];
    const expectedWithHiddenFieldAndMultiple =
      '<input name="continent[countries][]" type="hidden" value="" autocomplete="off"/><select name="continent[countries][]" id="continent_countries" multiple="multiple"><option selected="selected" value="Africa">Africa</option>\n<option selected="selected" value="Europe">Europe</option>\n<option value="America">America</option></select>';
    const expectedWithoutHiddenField =
      '<select name="continent[countries]" id="continent_countries"><option selected="selected" value="Africa">Africa</option>\n<option selected="selected" value="Europe">Europe</option>\n<option value="America">America</option></select>';
    const choices = ["Africa", "Europe", "America"];
    assertDomEqual(
      expectedWithHiddenFieldAndMultiple,
      select("continent", "countries", choices, { multiple: true }),
    );
    assertDomEqual(
      expectedWithHiddenFieldAndMultiple,
      select("continent", "countries", choices, {}, { multiple: true }),
    );
    assertDomEqual(expectedWithoutHiddenField, select("continent", "countries", choices));
  });

  it("required select", () => {
    const expected =
      '<select id="post_category" name="post[category]" required="required"><option value="" label=" "></option>\n<option value="abe">abe</option>\n<option value="mus">mus</option>\n<option value="hest">hest</option></select>';
    assertDomEqual(
      expected,
      select("post", "category", ["abe", "mus", "hest"], {}, { required: true }),
    );
    assertDomEqual(
      expected,
      select("post", "category", ["abe", "mus", "hest"], { required: true }),
    );
  });

  it("select escapes options", () => {
    assertDomEqual(
      '<select id="post_title" name="post[title]">&lt;script&gt;alert(1)&lt;/script&gt;</select>',
      select("post", "title", "<script>alert(1)</script>"),
    );
  });

  it("grouped options for select with array", () => {
    assertDomEqual(
      '<optgroup label="North America"><option value="US">United States</option>\n<option value="Canada">Canada</option></optgroup><optgroup label="Europe"><option value="GB">Great Britain</option>\n<option value="Germany">Germany</option></optgroup>',
      view.groupedOptionsForSelect([
        ["North America", [["United States", "US"], "Canada"]],
        ["Europe", [["Great Britain", "GB"], "Germany"]],
      ]),
    );
  });
});
