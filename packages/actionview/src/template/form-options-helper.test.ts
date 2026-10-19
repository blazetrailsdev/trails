/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeZone, assertMatch, assertRaises, isHtmlSafe } from "@blazetrails/activesupport";
import { ArgumentError, Range, Struct } from "@blazetrails/ruby-compat";
import { Date as RubyDate } from "@blazetrails/date";
import { Errors } from "@blazetrails/activemodel";

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
const Country = Struct.new("country_id", "country_name");
const Digest = Struct.new("send_day");

class Firm {
  constructor(public time_zone: unknown = null) {}
}

class FakeZone {
  constructor(public name: string) {}
  toString(): string {
    return this.name;
  }
  isMatch(_re: unknown): unknown {
    return null;
  }
}

type View = Base & Record<string, any>;

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
    expect(isHtmlSafe(view.timeZoneOptionsForSelect())).toBe(true);
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
      (tz as any).caseEquals = () => {
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
});
