/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeZone, assertMatch, assertRaises, isHtmlSafe } from "@blazetrails/activesupport";
import { ArgumentError, Range, Struct } from "@blazetrails/ruby-compat";
import { Date as RubyDate } from "@blazetrails/date";
import { Errors } from "@blazetrails/activemodel";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import type { TextHelperHost } from "../helpers/text-helper.js";
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
const Country = Struct.new("country_id", "country_name");
const Album = Struct.new("id", "title", "genre");
const Digest = Struct.new("send_day");

class Firm {
  constructor(public time_zone: unknown = null) {}
}

class FakeZone {
  caseEquals?: () => never;
  constructor(public name: string) {}
  toString(): string {
    return this.name;
  }
  isMatch(_re: unknown): unknown {
    return null;
  }
}

type View = Base & TextHelperHost & Record<string, any>;

describe("FormOptionsHelperTest", () => {
  let view: View;

  let fakeZones: Record<string, FakeZone>;
  let fakeTimezones: FakeZone[];

  beforeEach(() => {
    fakeZones = Object.fromEntries(["A", "B", "C", "D", "E"].map((id) => [id, new FakeZone(id)]));
    vi.spyOn(TimeZone, "find").mockImplementation(
      (id) => fakeZones[id as string] as unknown as TimeZone,
    );
    vi.spyOn(TimeZone, "all").mockImplementation(
      () => Object.values(fakeZones) as unknown as TimeZone[],
    );
    fakeTimezones = TimeZone.all() as unknown as FakeZone[];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
  });

  const optionsForSelect = (...args: unknown[]) => view.optionsForSelect(...args);
  const select = (...args: unknown[]) => view.select(...args);
  const dummyPosts = () => [
    new Post("<Abe> went home", "<Abe>", "To a little house", "shh!"),
    new Post("Babe went home", "Babe", "To a little house", "shh!"),
    new Post("Cabe went home", "Cabe", "To a little house", "shh!"),
  ];
  const dummyContinents = () => [
    new Continent("<Africa>", [
      new Country("<sa>", "<South Africa>"),
      new Country("so", "Somalia"),
    ]),
    new Continent("Europe", [new Country("dk", "Denmark"), new Country("ie", "Ireland")]),
  ];

  it("array options for select", () => {
    assertDomEqual(
      '<option value="&lt;Denmark&gt;">&lt;Denmark&gt;</option>\n<option value="USA">USA</option>\n<option value="Sweden">Sweden</option>',
      optionsForSelect(["<Denmark>", "USA", "Sweden"]),
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
      '<option value="Dollar" selected="selected">$</option>\n<option value="&lt;Kroner&gt;">&lt;DKR&gt;</option>',
      optionsForSelect({ $: "Dollar", "<DKR>": "<Kroner>" }, "Dollar"),
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
  it("collection select", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      view.collectionSelect("post", "author_name", dummyPosts(), "author_name", "author_name"),
    );
  });

  it("collection select under fields for", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) => {
      view.concat(f.collectionSelect("author_name", dummyPosts(), "author_name", "author_name"));
    });

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      outputBuffer,
    );
  });

  it("collection select under fields for with index", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    const outputBuffer = view.fieldsFor("post", view.post, { index: 815 }, (f: any) => {
      view.concat(f.collectionSelect("author_name", dummyPosts(), "author_name", "author_name"));
    });

    assertDomEqual(
      '<select id="post_815_author_name" name="post[815][author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      outputBuffer,
    );
  });

  it("collection select under fields for with auto index", () => {
    view.post = new Post();
    view.post.author_name = "Babe";
    view.post.toParam = () => 815;

    const outputBuffer = view.fieldsFor("post[]", view.post, {}, (f: any) => {
      view.concat(f.collectionSelect("author_name", dummyPosts(), "author_name", "author_name"));
    });

    assertDomEqual(
      '<select id="post_815_author_name" name="post[815][author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      outputBuffer,
    );
  });

  it("collection select with blank and style", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]" style="width: 200px"><option value="" label=" "></option>\n<option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      view.collectionSelect(
        "post",
        "author_name",
        dummyPosts(),
        "author_name",
        "author_name",
        { includeBlank: true },
        { style: "width: 200px" },
      ),
    );
  });

  it("collection select with blank as string and style", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]" style="width: 200px"><option value="">No Selection</option>\n<option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      view.collectionSelect(
        "post",
        "author_name",
        dummyPosts(),
        "author_name",
        "author_name",
        { includeBlank: "No Selection" },
        { style: "width: 200px" },
      ),
    );
  });

  it("collection select with multiple option appends array brackets and hidden input", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    const expected =
      '<input type="hidden" name="post[author_name][]" value="" autocomplete="off"/><select id="post_author_name" name="post[author_name][]" multiple="multiple"><option value="" label=" "></option>\n<option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe">Cabe</option></select>';

    assertDomEqual(
      expected,
      view.collectionSelect(
        "post",
        "author_name",
        dummyPosts(),
        "author_name",
        "author_name",
        { includeBlank: true },
        { multiple: true },
      ),
    );

    assertDomEqual(
      expected,
      view.collectionSelect(
        "post",
        "author_name",
        dummyPosts(),
        "author_name",
        "author_name",
        { includeBlank: true, name: "post[author_name][]" },
        { multiple: true },
      ),
    );
  });

  it("collection select with blank and selected", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]"><option value="" label=" "></option>\n<option value="&lt;Abe&gt;" selected="selected">&lt;Abe&gt;</option>\n<option value="Babe">Babe</option>\n<option value="Cabe">Cabe</option></select>',
      view.collectionSelect("post", "author_name", dummyPosts(), "author_name", "author_name", {
        includeBlank: true,
        selected: "<Abe>",
      }),
    );
  });

  it("collection select with disabled", () => {
    view.post = new Post();
    view.post.author_name = "Babe";

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt;</option>\n<option value="Babe" selected="selected">Babe</option>\n<option value="Cabe" disabled="disabled">Cabe</option></select>',
      view.collectionSelect("post", "author_name", dummyPosts(), "author_name", "author_name", {
        disabled: "Cabe",
      }),
    );
  });

  it("collection select with proc for value method", () => {
    view.post = new Post();

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt; went home</option>\n<option value="Babe">Babe went home</option>\n<option value="Cabe">Cabe went home</option></select>',
      view.collectionSelect(
        "post",
        "author_name",
        dummyPosts(),
        (p: any) => p.author_name,
        "title",
      ),
    );
  });

  it("collection select with proc for text method", () => {
    view.post = new Post();

    assertDomEqual(
      '<select id="post_author_name" name="post[author_name]"><option value="&lt;Abe&gt;">&lt;Abe&gt; went home</option>\n<option value="Babe">Babe went home</option>\n<option value="Cabe">Cabe went home</option></select>',
      view.collectionSelect(
        "post",
        "author_name",
        dummyPosts(),
        "author_name",
        (p: any) => p.title,
      ),
    );
  });

  it("grouped collection select", () => {
    view.post = new Post();
    view.post.origin = "dk";

    assertDomEqual(
      '<select id="post_origin" name="post[origin]"><optgroup label="&lt;Africa&gt;"><option value="&lt;sa&gt;">&lt;South Africa&gt;</option>\n<option value="so">Somalia</option></optgroup><optgroup label="Europe"><option value="dk" selected="selected">Denmark</option>\n<option value="ie">Ireland</option></optgroup></select>',
      view.groupedCollectionSelect(
        "post",
        "origin",
        dummyContinents(),
        "countries",
        "continent_name",
        "country_id",
        "country_name",
      ),
    );
  });

  it("grouped collection select with selected", () => {
    view.post = new Post();

    assertDomEqual(
      '<select id="post_origin" name="post[origin]"><optgroup label="&lt;Africa&gt;"><option value="&lt;sa&gt;">&lt;South Africa&gt;</option>\n<option value="so">Somalia</option></optgroup><optgroup label="Europe"><option value="dk" selected="selected">Denmark</option>\n<option value="ie">Ireland</option></optgroup></select>',
      view.groupedCollectionSelect(
        "post",
        "origin",
        dummyContinents(),
        "countries",
        "continent_name",
        "country_id",
        "country_name",
        { selected: "dk" },
      ),
    );
  });

  it("grouped collection select with disabled value", () => {
    view.post = new Post();

    assertDomEqual(
      '<select id="post_origin" name="post[origin]"><optgroup label="&lt;Africa&gt;"><option value="&lt;sa&gt;">&lt;South Africa&gt;</option>\n<option value="so">Somalia</option></optgroup><optgroup label="Europe"><option disabled="disabled" value="dk">Denmark</option>\n<option value="ie">Ireland</option></optgroup></select>',
      view.groupedCollectionSelect(
        "post",
        "origin",
        dummyContinents(),
        "countries",
        "continent_name",
        "country_id",
        "country_name",
        { disabled: "dk" },
      ),
    );
  });

  it("grouped collection select under fields for", () => {
    view.post = new Post();
    view.post.origin = "dk";

    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) => {
      view.concat(
        f.groupedCollectionSelect(
          "origin",
          dummyContinents(),
          "countries",
          "continent_name",
          "country_id",
          "country_name",
        ),
      );
    });

    assertDomEqual(
      '<select id="post_origin" name="post[origin]"><optgroup label="&lt;Africa&gt;"><option value="&lt;sa&gt;">&lt;South Africa&gt;</option>\n<option value="so">Somalia</option></optgroup><optgroup label="Europe"><option value="dk" selected="selected">Denmark</option>\n<option value="ie">Ireland</option></optgroup></select>',
      outputBuffer,
    );
  });

  it("weekday options for select with no params", () => {
    assertDomEqual(
      '<option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option>',
      view.weekdayOptionsForSelect(),
    );
  });

  it("weekday options for select with index as value", () => {
    assertDomEqual(
      '<option value="1">Monday</option>\n<option value="2">Tuesday</option>\n<option value="3">Wednesday</option>\n<option value="4">Thursday</option>\n<option value="5">Friday</option>\n<option value="6">Saturday</option>\n<option value="0">Sunday</option>',
      view.weekdayOptionsForSelect(null, { indexAsValue: true }),
    );
  });

  it("weekday options for select with abberviated day names", () => {
    assertDomEqual(
      '<option value="Mon">Mon</option>\n<option value="Tue">Tue</option>\n<option value="Wed">Wed</option>\n<option value="Thu">Thu</option>\n<option value="Fri">Fri</option>\n<option value="Sat">Sat</option>\n<option value="Sun">Sun</option>',
      view.weekdayOptionsForSelect(null, { dayFormat: "abbr_day_names" }),
    );
  });

  it("weekday options for select with beginning of week set to sunday", () => {
    assertDomEqual(
      '<option value="Sunday">Sunday</option>\n<option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>',
      view.weekdayOptionsForSelect(null, { beginningOfWeek: ":sunday" }),
    );
  });

  it("weekday options for select with beginning of week set to saturday", () => {
    assertDomEqual(
      '<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option>\n<option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>',
      view.weekdayOptionsForSelect(null, { beginningOfWeek: ":saturday" }),
    );
  });

  it("weekday options for select with beginning of week set elsewhere", () => {
    RubyDate.setBeginningOfWeek(":sunday");
    assertDomEqual(
      '<option value="Sunday">Sunday</option>\n<option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>',
      view.weekdayOptionsForSelect(),
    );
    RubyDate.setBeginningOfWeek(":monday");
  });

  it("weekday options for select with selected value", () => {
    assertDomEqual(
      '<option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option selected="selected" value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option>',
      view.weekdayOptionsForSelect("Friday"),
    );
  });

  it("weekday select", () => {
    assertDomEqual(
      '<select name="model[weekday]" id="model_weekday"><option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option></select>',
      view.weekdaySelect("model", "weekday"),
    );
  });

  it("weekday select with selected value", () => {
    assertDomEqual(
      '<select name="model[weekday]" id="model_weekday"><option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option selected="selected" value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option></select>',
      view.weekdaySelect("model", "weekday", { selected: "Friday" }),
    );
  });

  it("weekday select under fields for", () => {
    view.digest = new Digest();

    const outputBuffer = view.fieldsFor("digest", view.digest, {}, (f: any) => {
      view.concat(f.weekdaySelect("send_day"));
    });

    assertDomEqual(
      '<select id="digest_send_day" name="digest[send_day]"><option value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option></select>',
      outputBuffer,
    );
  });

  it("weekday select under fields for with value", () => {
    view.digest = new Digest();
    view.digest.send_day = "Monday";

    const outputBuffer = view.fieldsFor("digest", view.digest, {}, (f: any) => {
      view.concat(f.weekdaySelect("send_day"));
    });

    assertDomEqual(
      '<select name="digest[send_day]" id="digest_send_day"><option selected="selected" value="Monday">Monday</option>\n<option value="Tuesday">Tuesday</option>\n<option value="Wednesday">Wednesday</option>\n<option value="Thursday">Thursday</option>\n<option value="Friday">Friday</option>\n<option value="Saturday">Saturday</option>\n<option value="Sunday">Sunday</option></select>',
      outputBuffer,
    );
  });
  it("time zone options no params", () => {
    const opts = view.timeZoneOptionsForSelect();
    assertDomEqual(
      '<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D">D</option>\n<option value="E">E</option>',
      opts,
    );
  });

  it("time zone options with selected", () => {
    const opts = view.timeZoneOptionsForSelect("D");
    assertDomEqual(
      '<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option>',
      opts,
    );
  });

  it("time zone options with unknown selected", () => {
    const opts = view.timeZoneOptionsForSelect("K");
    assertDomEqual(
      '<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D">D</option>\n<option value="E">E</option>',
      opts,
    );
  });

  it("time zone options with priority zones", () => {
    const zones = [new TimeZone("B"), new TimeZone("E")];
    const opts = view.timeZoneOptionsForSelect(null, zones);
    assertDomEqual(
      '<option value="B">B</option>\n<option value="E">E</option><option value="" disabled="disabled">-------------</option>\n<option value="A">A</option>\n<option value="C">C</option>\n<option value="D">D</option>',
      opts,
    );
  });

  it("time zone options with selected priority zones", () => {
    const zones = [new TimeZone("B"), new TimeZone("E")];
    const opts = view.timeZoneOptionsForSelect("E", zones);
    assertDomEqual(
      '<option value="B">B</option>\n<option value="E" selected="selected">E</option><option value="" disabled="disabled">-------------</option>\n<option value="A">A</option>\n<option value="C">C</option>\n<option value="D">D</option>',
      opts,
    );
  });

  it("time zone options with unselected priority zones", () => {
    const zones = [new TimeZone("B"), new TimeZone("E")];
    const opts = view.timeZoneOptionsForSelect("C", zones);
    assertDomEqual(
      '<option value="B">B</option>\n<option value="E">E</option><option value="" disabled="disabled">-------------</option>\n<option value="A">A</option>\n<option value="C" selected="selected">C</option>\n<option value="D">D</option>',
      opts,
    );
  });

  it("time zone options with priority zones does not mutate time zones", () => {
    const originalZones = [...TimeZone.all()];
    const zones = [new TimeZone("B"), new TimeZone("E")];
    view.timeZoneOptionsForSelect(null, zones);
    expect(TimeZone.all()).toEqual(originalZones);
  });

  it("time zone options returns html safe string", () => {
    expect(isHtmlSafe(view.timeZoneOptionsForSelect())).toBeTruthy();
  });

  it("time zone select", () => {
    view.firm = new Firm("D");
    const html = view.timeZoneSelect("firm", "time_zone");
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select under fields for", () => {
    view.firm = new Firm("D");

    const outputBuffer = view.fieldsFor("firm", view.firm, {}, (f: any) => {
      view.concat(f.timeZoneSelect("time_zone"));
    });

    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      outputBuffer,
    );
  });

  it("time zone select under fields for with index", () => {
    view.firm = new Firm("D");

    const outputBuffer = view.fieldsFor("firm", view.firm, { index: 305 }, (f: any) => {
      view.concat(f.timeZoneSelect("time_zone"));
    });

    assertDomEqual(
      '<select id="firm_305_time_zone" name="firm[305][time_zone]"><option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      outputBuffer,
    );
  });

  it("time zone select under fields for with auto index", () => {
    view.firm = new Firm("D");
    view.firm.toParam = () => 305;

    const outputBuffer = view.fieldsFor("firm[]", view.firm, {}, (f: any) => {
      view.concat(f.timeZoneSelect("time_zone"));
    });

    assertDomEqual(
      '<select id="firm_305_time_zone" name="firm[305][time_zone]"><option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      outputBuffer,
    );
  });

  it("time zone select with blank", () => {
    view.firm = new Firm("D");
    const html = view.timeZoneSelect("firm", "time_zone", null, { includeBlank: true });
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="" label=" "></option>\n<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select with blank as string", () => {
    view.firm = new Firm("D");
    const html = view.timeZoneSelect("firm", "time_zone", null, { includeBlank: "No Zone" });
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="">No Zone</option>\n<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select with style", () => {
    view.firm = new Firm("D");
    const html = view.timeZoneSelect("firm", "time_zone", null, {}, { style: "color: red" });
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]" style="color: red"><option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
    assertDomEqual(
      html,
      view.timeZoneSelect("firm", "time_zone", null, {}, { style: "color: red" }),
    );
  });

  it("time zone select with blank and style", () => {
    view.firm = new Firm("D");
    const html = view.timeZoneSelect(
      "firm",
      "time_zone",
      null,
      { includeBlank: true },
      { style: "color: red" },
    );
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]" style="color: red"><option value="" label=" "></option>\n<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
    assertDomEqual(
      html,
      view.timeZoneSelect(
        "firm",
        "time_zone",
        null,
        { includeBlank: true },
        { style: "color: red" },
      ),
    );
  });

  it("time zone select with blank as string and style", () => {
    view.firm = new Firm("D");
    const html = view.timeZoneSelect(
      "firm",
      "time_zone",
      null,
      { includeBlank: "No Zone" },
      { style: "color: red" },
    );
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]" style="color: red"><option value="">No Zone</option>\n<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
    assertDomEqual(
      html,
      view.timeZoneSelect(
        "firm",
        "time_zone",
        null,
        { includeBlank: "No Zone" },
        { style: "color: red" },
      ),
    );
  });

  it("time zone select with priority zones", () => {
    view.firm = new Firm("D");
    const zones = [new TimeZone("A"), new TimeZone("D")];
    const html = view.timeZoneSelect("firm", "time_zone", zones);
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="D" selected="selected">D</option><option value="" disabled="disabled">-------------</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select with priority zones as regexp", () => {
    view.firm = new Firm("D");

    for (const tz of fakeTimezones) {
      tz.isMatch = () => ["A", "D"].includes(tz.name);
    }

    const html = view.timeZoneSelect("firm", "time_zone", /A|D/);
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="D" selected="selected">D</option><option value="" disabled="disabled">-------------</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select with priority zones is not implemented with grep", () => {
    view.firm = new Firm("D");

    for (const tz of fakeTimezones) {
      tz.caseEquals = () => {
        throw new Error();
      };
    }

    const html = view.timeZoneSelect("firm", "time_zone", /A|D/);
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="" disabled="disabled">-------------</option>\n<option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select with priority zones and errors", () => {
    view.firm = new Firm("D");
    view.firm.errors = new Errors(view.firm);
    view.firm.errors.add("time_zone", "invalid");
    const zones = [new TimeZone("A"), new TimeZone("D")];
    const html = view.timeZoneSelect("firm", "time_zone", zones);
    assertDomEqual(
      '<div class="field_with_errors"><select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="D" selected="selected">D</option><option value="" disabled="disabled">-------------</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="E">E</option></select></div>',
      html,
    );
  });

  it("time zone select with default time zone and nil value", () => {
    view.firm = new Firm();
    view.firm.time_zone = null;

    const html = view.timeZoneSelect("firm", "time_zone", null, { default: "B" });
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="B" selected="selected">B</option>\n<option value="C">C</option>\n<option value="D">D</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  it("time zone select with default time zone and value", () => {
    view.firm = new Firm("D");

    const html = view.timeZoneSelect("firm", "time_zone", null, { default: "B" });
    assertDomEqual(
      '<select id="firm_time_zone" name="firm[time_zone]"><option value="A">A</option>\n<option value="B">B</option>\n<option value="C">C</option>\n<option value="D" selected="selected">D</option>\n<option value="E">E</option></select>',
      html,
    );
  });

  const optionsFromCollectionForSelect = (...args: unknown[]) =>
    view.optionsFromCollectionForSelect(...args);
  const optionGroupsFromCollectionForSelect = (...args: unknown[]) =>
    view.optionGroupsFromCollectionForSelect(...args);
  const groupedOptionsForSelect = (...args: unknown[]) => view.groupedOptionsForSelect(...args);
  const abeBabeCabe = (abe: string, babe: string, cabe: string) =>
    `<option value="&lt;Abe&gt;"${abe}>&lt;Abe&gt; went home</option>\n<option value="Babe"${babe}>Babe went home</option>\n<option value="Cabe"${cabe}>Cabe went home</option>`;
  const SEL = ' selected="selected"';
  const DIS = ' disabled="disabled"';
  const continentsHtml =
    '<optgroup label="&lt;Africa&gt;"><option value="&lt;sa&gt;">&lt;South Africa&gt;</option>\n<option value="so">Somalia</option></optgroup><optgroup label="Europe"><option value="dk" selected="selected">Denmark</option>\n<option value="ie">Ireland</option></optgroup>';

  it("collection options", () => {
    assertDomEqual(
      abeBabeCabe("", "", ""),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title"),
    );
  });

  // PERMANENT-SKIP: Ruby method visibility is not carried at run time (CLAUDE.md, "Method visibility is compile-time only").
  it.skip("collection options with private value method", async () => {
    const e = await assertRaises([Error], {}, () =>
      optionsFromCollectionForSelect(dummyPosts(), "secret", "title"),
    );
    assertMatch(/private method/, e.message);
  });

  // PERMANENT-SKIP: Ruby method visibility is not carried at run time (CLAUDE.md, "Method visibility is compile-time only").
  it.skip("collection options with private text method", async () => {
    const e = await assertRaises([Error], {}, () =>
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "secret"),
    );
    assertMatch(/private method/, e.message);
  });

  it("collection options with preselected value", () => {
    assertDomEqual(
      abeBabeCabe("", SEL, ""),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title", "Babe"),
    );
  });

  it("collection options with preselected value array", () => {
    assertDomEqual(
      abeBabeCabe("", SEL, SEL),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title", ["Babe", "Cabe"]),
    );
  });

  it("collection options with proc for selected", () => {
    assertDomEqual(
      abeBabeCabe("", SEL, ""),
      optionsFromCollectionForSelect(
        dummyPosts(),
        "author_name",
        "title",
        (p: any) => p.author_name === "Babe",
      ),
    );
  });

  it("collection options with disabled value", () => {
    assertDomEqual(
      abeBabeCabe("", DIS, ""),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title", { disabled: "Babe" }),
    );
  });

  it("collection options with disabled array", () => {
    assertDomEqual(
      abeBabeCabe("", DIS, DIS),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title", {
        disabled: ["Babe", "Cabe"],
      }),
    );
  });

  it("collection options with preselected and disabled value", () => {
    assertDomEqual(
      abeBabeCabe("", DIS, SEL),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title", {
        selected: "Cabe",
        disabled: "Babe",
      }),
    );
  });

  it("collection options with proc for disabled", () => {
    assertDomEqual(
      abeBabeCabe("", DIS, DIS),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", "title", {
        disabled: (p: any) => ["Babe", "Cabe"].includes(p.author_name),
      }),
    );
  });

  it("collection options with proc for value method", () => {
    assertDomEqual(
      abeBabeCabe("", "", ""),
      optionsFromCollectionForSelect(dummyPosts(), (p: any) => p.author_name, "title"),
    );
  });

  it("collection options with proc for text method", () => {
    assertDomEqual(
      abeBabeCabe("", "", ""),
      optionsFromCollectionForSelect(dummyPosts(), "author_name", (p: any) => p.title),
    );
  });

  it("collection options with element attributes", () => {
    assertDomEqual(
      '<option value="USA" class="bold">USA</option>',
      optionsFromCollectionForSelect([["USA", "USA", { class: "bold" }]], "first", "second"),
    );
  });

  it("string options for select", () => {
    const options =
      '<option value="Denmark">Denmark</option><option value="USA">USA</option><option value="Sweden">Sweden</option>';
    assertDomEqual(options, optionsForSelect(options));
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

  it("array options for select with custom defined disabled", () => {
    assertDomEqual(
      '<option disabled="disabled" type="Coach" value="1">Richard Bandler</option>\n<option type="Coachee" value="1">Richard Bandler</option>',
      optionsForSelect([
        ["Richard Bandler", 1, { type: "Coach", disabled: "disabled" }],
        ["Richard Bandler", 1, { type: "Coachee" }],
      ]),
    );
  });

  it("array options for select with selection array", () => {
    assertDomEqual(
      '<option value="Denmark">Denmark</option>\n<option value="&lt;USA&gt;" selected="selected">&lt;USA&gt;</option>\n<option value="Sweden" selected="selected">Sweden</option>',
      optionsForSelect(["Denmark", "<USA>", "Sweden"], ["<USA>", "Sweden"]),
    );
  });

  it("array options for select with disabled value", () => {
    assertDomEqual(
      '<option value="Denmark">Denmark</option>\n<option value="&lt;USA&gt;" disabled="disabled">&lt;USA&gt;</option>\n<option value="Sweden">Sweden</option>',
      optionsForSelect(["Denmark", "<USA>", "Sweden"], { disabled: "<USA>" }),
    );
  });

  it("array options for select with disabled array", () => {
    assertDomEqual(
      '<option value="Denmark">Denmark</option>\n<option value="&lt;USA&gt;" disabled="disabled">&lt;USA&gt;</option>\n<option value="Sweden" disabled="disabled">Sweden</option>',
      optionsForSelect(["Denmark", "<USA>", "Sweden"], { disabled: ["<USA>", "Sweden"] }),
    );
  });

  it("array options for select with selection and disabled value", () => {
    assertDomEqual(
      '<option value="Denmark" selected="selected">Denmark</option>\n<option value="&lt;USA&gt;" disabled="disabled">&lt;USA&gt;</option>\n<option value="Sweden">Sweden</option>',
      optionsForSelect(["Denmark", "<USA>", "Sweden"], { selected: "Denmark", disabled: "<USA>" }),
    );
  });

  it("boolean array options for select with selection and disabled value", () => {
    assertDomEqual(
      '<option value="true">true</option>\n<option value="false" selected="selected">false</option>',
      optionsForSelect([true, false], { selected: false, disabled: null }),
    );
  });

  it("array options for string include in other string bug fix", () => {
    assertDomEqual(
      '<option value="ruby">ruby</option>\n<option value="rubyonrails" selected="selected">rubyonrails</option>',
      optionsForSelect(["ruby", "rubyonrails"], "rubyonrails"),
    );
    assertDomEqual(
      '<option value="ruby" selected="selected">ruby</option>\n<option value="rubyonrails">rubyonrails</option>',
      optionsForSelect(["ruby", "rubyonrails"], "ruby"),
    );
    assertDomEqual(
      '<option value="ruby" selected="selected">ruby</option>\n<option value="rubyonrails">rubyonrails</option>\n<option value=""></option>',
      optionsForSelect(["ruby", "rubyonrails", null], "ruby"),
    );
  });

  it("ducktyped options for select", () => {
    const quack = Struct.new("first", "last");
    assertDomEqual(
      '<option value="&lt;Kroner&gt;">&lt;DKR&gt;</option>\n<option value="Dollar">$</option>',
      optionsForSelect([new quack("<DKR>", "<Kroner>"), new quack("$", "Dollar")]),
    );
    assertDomEqual(
      '<option value="&lt;Kroner&gt;">&lt;DKR&gt;</option>\n<option value="Dollar" selected="selected">$</option>',
      optionsForSelect([new quack("<DKR>", "<Kroner>"), new quack("$", "Dollar")], "Dollar"),
    );
    assertDomEqual(
      '<option value="&lt;Kroner&gt;" selected="selected">&lt;DKR&gt;</option>\n<option value="Dollar" selected="selected">$</option>',
      optionsForSelect(
        [new quack("<DKR>", "<Kroner>"), new quack("$", "Dollar")],
        ["Dollar", "<Kroner>"],
      ),
    );
  });

  it("collection options with preselected value as string and option value is integer", () => {
    const albums = [new Album(1, "first", "rap"), new Album(2, "second", "pop")];
    assertDomEqual(
      '<option selected="selected" value="1">rap</option>\n<option value="2">pop</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", { selected: "1" }),
    );
  });

  it("collection options with preselected value as integer and option value is string", () => {
    const albums = [new Album("1", "first", "rap"), new Album("2", "second", "pop")];
    assertDomEqual(
      '<option selected="selected" value="1">rap</option>\n<option value="2">pop</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", { selected: 1 }),
    );
  });

  it("collection options with preselected value as string and option value is float", () => {
    const albums = [
      new Album(new Number(1.0), "first", "rap"),
      new Album(new Number(2.0), "second", "pop"),
    ];
    assertDomEqual(
      '<option value="1.0">rap</option>\n<option value="2.0" selected="selected">pop</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", { selected: "2.0" }),
    );
  });

  it("collection options with preselected value as nil", () => {
    const albums = [
      new Album(new Number(1.0), "first", "rap"),
      new Album(new Number(2.0), "second", "pop"),
    ];
    assertDomEqual(
      '<option value="1.0">rap</option>\n<option value="2.0">pop</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", { selected: null }),
    );
  });

  it("collection options with disabled value as nil", () => {
    const albums = [
      new Album(new Number(1.0), "first", "rap"),
      new Album(new Number(2.0), "second", "pop"),
    ];
    assertDomEqual(
      '<option value="1.0">rap</option>\n<option value="2.0">pop</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", { disabled: null }),
    );
  });

  it("collection options with disabled value as array", () => {
    const albums = [
      new Album(new Number(1.0), "first", "rap"),
      new Album(new Number(2.0), "second", "pop"),
    ];
    assertDomEqual(
      '<option disabled="disabled" value="1.0">rap</option>\n<option disabled="disabled" value="2.0">pop</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", { disabled: ["1.0", new Number(2.0)] }),
    );
  });

  it("collection options with preselected values as string array and option value is float", () => {
    const albums = [
      new Album(new Number(1.0), "first", "rap"),
      new Album(new Number(2.0), "second", "pop"),
      new Album(new Number(3.0), "third", "country"),
    ];
    assertDomEqual(
      '<option value="1.0" selected="selected">rap</option>\n<option value="2.0">pop</option>\n<option value="3.0" selected="selected">country</option>',
      optionsFromCollectionForSelect(albums, "id", "genre", ["1.0", "3.0"]),
    );
  });

  it("option groups from collection for select", () => {
    assertDomEqual(
      continentsHtml,
      optionGroupsFromCollectionForSelect(
        dummyContinents(),
        "countries",
        "continent_name",
        "country_id",
        "country_name",
        "dk",
      ),
    );
  });

  it("option groups from collection for select with callable group method", () => {
    const groupProc = (c: any) => c.countries;
    assertDomEqual(
      continentsHtml,
      optionGroupsFromCollectionForSelect(
        dummyContinents(),
        groupProc,
        "continent_name",
        "country_id",
        "country_name",
        "dk",
      ),
    );
  });

  it("option groups from collection for select with callable group label method", () => {
    const labelProc = (c: any) => c.continent_name;
    assertDomEqual(
      continentsHtml,
      optionGroupsFromCollectionForSelect(
        dummyContinents(),
        "countries",
        labelProc,
        "country_id",
        "country_name",
        "dk",
      ),
    );
  });

  it("option groups from collection for select returns html safe string", () => {
    expect(
      isHtmlSafe(
        optionGroupsFromCollectionForSelect(
          dummyContinents(),
          "countries",
          "continent_name",
          "country_id",
          "country_name",
          "dk",
        ),
      ),
    ).toBeTruthy();
  });

  it("grouped options for select with array and html attributes", () => {
    assertDomEqual(
      '<optgroup label="North America" data-foo="bar"><option value="US">United States</option>\n<option value="Canada">Canada</option></optgroup><optgroup label="Europe" disabled="disabled"><option value="GB">Great Britain</option>\n<option value="Germany">Germany</option></optgroup>',
      groupedOptionsForSelect([
        ["North America", [["United States", "US"], "Canada"], { data: { foo: "bar" } }],
        ["Europe", [["Great Britain", "GB"], "Germany"], { disabled: "disabled" }],
      ]),
    );
  });

  it("grouped options for select with optional divider", () => {
    assertDomEqual(
      '<optgroup label="----------"><option value="US">US</option>\n<option value="Canada">Canada</option></optgroup><optgroup label="----------"><option value="GB">GB</option>\n<option value="Germany">Germany</option></optgroup>',
      groupedOptionsForSelect(
        [
          ["US", "Canada"],
          ["GB", "Germany"],
        ],
        null,
        { divider: "----------" },
      ),
    );
  });

  it("grouped options for select with selected and prompt", () => {
    assertDomEqual(
      '<option value="">Choose a product...</option><optgroup label="Hats"><option value="Baseball Cap">Baseball Cap</option>\n<option selected="selected" value="Cowboy Hat">Cowboy Hat</option></optgroup>',
      groupedOptionsForSelect([["Hats", ["Baseball Cap", "Cowboy Hat"]]], "Cowboy Hat", {
        prompt: "Choose a product...",
      }),
    );
  });

  it("grouped options for select with selected and prompt true", () => {
    assertDomEqual(
      '<option value="">Please select</option><optgroup label="Hats"><option value="Baseball Cap">Baseball Cap</option>\n<option selected="selected" value="Cowboy Hat">Cowboy Hat</option></optgroup>',
      groupedOptionsForSelect([["Hats", ["Baseball Cap", "Cowboy Hat"]]], "Cowboy Hat", {
        prompt: true,
      }),
    );
  });

  it("grouped options for select returns html safe string", () => {
    expect(
      isHtmlSafe(groupedOptionsForSelect([["Hats", ["Baseball Cap", "Cowboy Hat"]]])),
    ).toBeTruthy();
  });

  it("grouped options for select with prompt returns html escaped string", () => {
    assertDomEqual(
      '<option value="">&lt;Choose One&gt;</option><optgroup label="Hats"><option value="Baseball Cap">Baseball Cap</option>\n<option value="Cowboy Hat">Cowboy Hat</option></optgroup>',
      groupedOptionsForSelect([["Hats", ["Baseball Cap", "Cowboy Hat"]]], null, {
        prompt: "<Choose One>",
      }),
    );
  });

  it("optgroups with with options with hash", () => {
    assertDomEqual(
      '<optgroup label="North America"><option value="United States">United States</option>\n<option value="Canada">Canada</option></optgroup><optgroup label="Europe"><option value="Denmark">Denmark</option>\n<option value="Germany">Germany</option></optgroup>',
      groupedOptionsForSelect({
        "North America": ["United States", "Canada"],
        Europe: ["Denmark", "Germany"],
      }),
    );
  });

  const abeMusHest = ["abe", "<mus>", "hest"];
  const postCategory = (inner: string, attrs = 'id="post_category" name="post[category]"') =>
    `<select ${attrs}>${inner}</select>`;
  const abeMusHestOptions = (abe: string, mus: string, hest: string) =>
    `<option value="abe"${abe}>abe</option>\n<option value="&lt;mus&gt;"${mus}>&lt;mus&gt;</option>\n<option value="hest"${hest}>hest</option>`;
  const promptBlank =
    '<option value="">Please select</option>\n<option value="" label=" "></option>\n';
  const newPost = (category: unknown) => {
    view.post = new Post();
    view.post.category = category;
  };
  const requiredExpected = (inner: string, attrs = "") =>
    `<select id="post_category" name="post[category]" required="required"${attrs}>${inner}<option value="abe">abe</option>\n<option value="mus">mus</option>\n<option value="hest">hest</option></select>`;

  it("select under fields for with index", () => {
    newPost("<mus>");
    const outputBuffer = view.fieldsFor("post", view.post, { index: 108 }, (f: any) => {
      view.concat(f.select("category", abeMusHest));
    });
    assertDomEqual(
      postCategory(
        abeMusHestOptions("", SEL, ""),
        'id="post_108_category" name="post[108][category]"',
      ),
      outputBuffer,
    );
  });

  it("select under fields for with auto index", () => {
    newPost("<mus>");
    view.post.toParam = () => 108;
    const outputBuffer = view.fieldsFor("post[]", view.post, {}, (f: any) => {
      view.concat(f.select("category", abeMusHest));
    });
    assertDomEqual(
      postCategory(
        abeMusHestOptions("", SEL, ""),
        'id="post_108_category" name="post[108][category]"',
      ),
      outputBuffer,
    );
  });

  it("select under fields for with string and given prompt", () => {
    view.post = new Post();
    const options = view.raw(
      '<option value="abe">abe</option><option value="mus">mus</option><option value="hest">hest</option>',
    );
    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) => {
      view.concat(f.select("category", options, { prompt: "The prompt" }));
    });
    assertDomEqual(postCategory(`<option value="">The prompt</option>\n${options}`), outputBuffer);
  });

  it("select under fields for with block", () => {
    view.post = new Post();
    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) => {
      view.concat(
        f.select("category", null, {}, {}, () => {
          view.concat(view.contentTag("option", "hello world"));
        }),
      );
    });
    assertDomEqual(postCategory("<option>hello world</option>"), outputBuffer);
  });

  it("select under fields for with block without options", () => {
    view.post = new Post();
    const outputBuffer = view.fieldsFor("post", view.post, {}, (f: any) => {
      view.concat(f.select("category", null, {}, {}, () => {}));
    });
    assertDomEqual(postCategory(""), outputBuffer);
  });

  it("select with multiple and without hidden input", () => {
    const outputBuffer = select(
      "post",
      "category",
      "",
      { includeHidden: false },
      { multiple: true },
    );
    assertDomEqual(
      '<select multiple="multiple" id="post_category" name="post[category][]"></select>',
      outputBuffer,
    );
  });

  it("select with multiple and with explicit name ending with brackets", () => {
    const outputBuffer = select(
      "post",
      "category",
      [],
      { includeHidden: false },
      { multiple: true, name: "post[category][]" },
    );
    assertDomEqual(
      '<select multiple="multiple" id="post_category" name="post[category][]"></select>',
      outputBuffer,
    );
  });

  it("select with multiple and disabled to add disabled hidden input", () => {
    const outputBuffer = select("post", "category", "", {}, { multiple: true, disabled: true });
    assertDomEqual(
      '<input disabled="disabled"type="hidden" name="post[category][]" value="" autocomplete="off"/><select multiple="multiple" disabled="disabled" id="post_category" name="post[category][]"></select>',
      outputBuffer,
    );
  });

  it("select with blank", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(`<option value="" label=" "></option>\n${abeMusHestOptions("", SEL, "")}`),
      select("post", "category", abeMusHest, { includeBlank: true }),
    );
  });

  it("select with blank as string", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(`<option value="">None</option>\n${abeMusHestOptions("", SEL, "")}`),
      select("post", "category", abeMusHest, { includeBlank: "None" }),
    );
  });

  it("select with blank as string escaped", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(`<option value="">&lt;None&gt;</option>\n${abeMusHestOptions("", SEL, "")}`),
      select("post", "category", abeMusHest, { includeBlank: "<None>" }),
    );
  });

  it("select with default prompt", () => {
    newPost("");
    assertDomEqual(
      postCategory(`<option value="">Please select</option>\n${abeMusHestOptions("", "", "")}`),
      select("post", "category", abeMusHest, { prompt: true }),
    );
  });

  it("select no prompt when select has value", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(abeMusHestOptions("", SEL, "")),
      select("post", "category", abeMusHest, { prompt: true }),
    );
  });

  it("select with given prompt", () => {
    newPost("");
    assertDomEqual(
      postCategory(`<option value="">The prompt</option>\n${abeMusHestOptions("", "", "")}`),
      select("post", "category", abeMusHest, { prompt: "The prompt" }),
    );
  });

  it("select with given prompt escaped", () => {
    view.post = new Post();
    assertDomEqual(
      postCategory(
        `<option value="">&lt;The prompt&gt;</option>\n${abeMusHestOptions("", "", "")}`,
      ),
      select("post", "category", abeMusHest, { prompt: "<The prompt>" }),
    );
  });

  it("select with prompt and blank", () => {
    newPost("");
    assertDomEqual(
      postCategory(`${promptBlank}${abeMusHestOptions("", "", "")}`),
      select("post", "category", abeMusHest, { prompt: true, includeBlank: true }),
    );
  });

  it("select with empty", () => {
    newPost("");
    assertDomEqual(
      postCategory(promptBlank),
      select("post", "category", [], { prompt: true, includeBlank: true }),
    );
  });

  it("select with html options", () => {
    newPost("");
    assertDomEqual(
      postCategory(
        promptBlank,
        'class="disabled" disabled="disabled" name="post[category]" id="post_category"',
      ),
      select(
        "post",
        "category",
        [],
        { prompt: true, includeBlank: true },
        { class: "disabled", disabled: true },
      ),
    );
  });

  it("select with nil", () => {
    newPost("othervalue");
    assertDomEqual(
      postCategory(
        '<option value=""></option>\n<option value="othervalue" selected="selected">othervalue</option>',
      ),
      select("post", "category", [null, "othervalue"]),
    );
  });

  it("select with nil as selected value", () => {
    newPost(null);
    assertDomEqual(
      postCategory(
        '<option selected="selected" value="">none</option>\n<option value="1">programming</option>\n<option value="2">economics</option>',
      ),
      select("post", "category", { none: null, programming: 1, economics: 2 }),
    );
  });

  it("select with nil and selected option as nil", () => {
    newPost(null);
    assertDomEqual(
      postCategory(
        '<option value="">none</option>\n<option value="1">programming</option>\n<option value="2">economics</option>',
      ),
      select("post", "category", { none: null, programming: 1, economics: 2 }, { selected: null }),
    );
  });

  it("required select with include blank prompt", () => {
    const expected = requiredExpected('<option value="">Select one</option>\n');
    assertDomEqual(
      expected,
      select(
        "post",
        "category",
        ["abe", "mus", "hest"],
        { includeBlank: "Select one" },
        { required: true },
      ),
    );
    assertDomEqual(
      expected,
      select("post", "category", ["abe", "mus", "hest"], {
        includeBlank: "Select one",
        required: true,
      }),
    );
  });

  it("required select with prompt", () => {
    assertDomEqual(
      requiredExpected('<option value="">Select one</option>\n'),
      select(
        "post",
        "category",
        ["abe", "mus", "hest"],
        { prompt: "Select one" },
        { required: true },
      ),
    );
    assertDomEqual(
      requiredExpected('<option value="">Select one</option>\n'),
      select("post", "category", ["abe", "mus", "hest"], { prompt: "Select one", required: true }),
    );
  });

  it("required select display size equals to one", () => {
    assertDomEqual(
      requiredExpected('<option value="" label=" "></option>\n', ' size="1"'),
      select("post", "category", ["abe", "mus", "hest"], {}, { required: true, size: 1 }),
    );
    assertDomEqual(
      requiredExpected('<option value="" label=" "></option>\n', ' size="1"'),
      select("post", "category", ["abe", "mus", "hest"], { required: true, size: 1 }),
    );
  });

  it("required select with display size bigger than one", () => {
    assertDomEqual(
      requiredExpected("", ' size="2"'),
      select("post", "category", ["abe", "mus", "hest"], {}, { required: true, size: 2 }),
    );
    assertDomEqual(
      requiredExpected("", ' size="2"'),
      select("post", "category", ["abe", "mus", "hest"], { required: true, size: 2 }),
    );
  });

  it("required select with multiple option", () => {
    const expected =
      '<input name="post[category][]" type="hidden" value="" autocomplete="off"/><select id="post_category" multiple="multiple" name="post[category][]" required="required"><option value="abe">abe</option>\n<option value="mus">mus</option>\n<option value="hest">hest</option></select>';
    assertDomEqual(
      expected,
      select("post", "category", ["abe", "mus", "hest"], {}, { required: true, multiple: true }),
    );
    assertDomEqual(
      expected,
      select("post", "category", ["abe", "mus", "hest"], { required: true, multiple: true }),
    );
  });

  it("select with integer", () => {
    newPost("");
    assertDomEqual(
      postCategory(`${promptBlank}<option value="1">1</option>`),
      select("post", "category", [1], { prompt: true, includeBlank: true }),
    );
  });

  it("list of lists", () => {
    newPost("");
    assertDomEqual(
      postCategory(
        `${promptBlank}<option value="number">Number</option>\n<option value="text">Text</option>\n<option value="boolean">Yes/No</option>`,
      ),
      select(
        "post",
        "category",
        [
          ["Number", "number"],
          ["Text", "text"],
          ["Yes/No", "boolean"],
        ],
        { prompt: true, includeBlank: true },
      ),
    );
  });

  it("select with selected value", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(abeMusHestOptions(SEL, "", "")),
      select("post", "category", abeMusHest, { selected: "abe" }),
    );
  });

  it("select with index option", () => {
    view.album = new Album();
    view.album.id = 1;
    view.album.toParam = () => String(view.album);
    const expected =
      '<select id="album__genre" name="album[][genre]"><option value="rap">rap</option>\n<option value="rock">rock</option>\n<option value="country">country</option></select>';
    assertDomEqual(
      expected,
      select("album[]", "genre", ["rap", "rock", "country"], {}, { index: null }),
    );
  });

  it("select with selected nil", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(abeMusHestOptions("", "", "")),
      select("post", "category", abeMusHest, { selected: null }),
    );
  });

  it("select with disabled value", () => {
    newPost("<mus>");
    assertDomEqual(
      postCategory(abeMusHestOptions("", SEL, DIS)),
      select("post", "category", abeMusHest, { disabled: "hest" }),
    );
  });

  it("select not existing method with selected value", () => {
    view.post = new Post();
    assertDomEqual(
      '<select id="post_locale" name="post[locale]"><option value="en">en</option>\n<option value="ru" selected="selected">ru</option></select>',
      select("post", "locale", ["en", "ru"], { selected: "ru" }),
    );
  });
});
