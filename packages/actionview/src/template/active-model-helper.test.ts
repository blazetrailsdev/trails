import "../test-helpers/abstract-unit.js";
import { beforeEach, describe, it } from "vitest";
import { Errors } from "@blazetrails/activemodel";
import { Date as RubyDate } from "@blazetrails/date";

import { Base } from "../base.js";
import { raw } from "../helpers/output-safety-helper.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

class Post {
  static modelName = { singular: "post", paramKey: "post", i18nKey: "post" };
  author_name: unknown = null;
  body: unknown = null;
  category: unknown = null;
  published: unknown = null;
  updated_at: unknown = null;
  errors: Errors<Post> = new Errors(this);
  get modelName(): typeof Post.modelName {
    return Post.modelName;
  }
  isPersisted(): boolean {
    return false;
  }
}

type View = Base & Record<string, (...args: unknown[]) => unknown> & { post: Post };

describe("ActiveModelHelperTest", () => {
  let view: View;

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
    const post = new Post();
    post.errors.add("author_name", "can't be empty");
    post.errors.add("body", "foo");
    post.errors.add("category", "must exist");
    post.errors.add("published", "must be accepted");
    post.errors.add("updated_at", "bar");

    post.author_name = "";
    post.body = "Back to the hill and over it again!";
    post.category = "rails";
    post.published = false;
    post.updated_at = RubyDate.civil(2004, 6, 15);
    view.post = post;
  });

  it("textarea with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><textarea id="post_body" name="post[body]">\nBack to the hill and over it again!</textarea></div>',
      view.textarea("post", "body"),
    );
  });

  it("text field with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><input id="post_author_name" name="post[author_name]" type="text" value="" /></div>',
      view.textField("post", "author_name"),
    );
  });

  it("select with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><select name="post[author_name]" id="post_author_name"><option value="a">a</option>\n<option value="b">b</option></select></div>',
      view.select("post", "author_name", ["a", "b"]),
    );
  });

  it("select with errors and blank option", () => {
    const expectedDom =
      '<div class="field_with_errors"><select name="post[author_name]" id="post_author_name"><option value="">Choose one...</option>\n<option value="a">a</option>\n<option value="b">b</option></select></div>';
    assertDomEqual(
      expectedDom,
      view.select("post", "author_name", ["a", "b"], { includeBlank: "Choose one..." }),
    );
    assertDomEqual(
      expectedDom,
      view.select("post", "author_name", ["a", "b"], { prompt: "Choose one..." }),
    );
  });

  it("select grouped options with errors", () => {
    const groupedOptions = [
      ["A", [["A1"], ["A2"]]],
      ["B", [["B1"], ["B2"]]],
    ];

    assertDomEqual(
      '<div class="field_with_errors"><select name="post[category]" id="post_category"><optgroup label="A"><option value="A1">A1</option>\n<option value="A2">A2</option></optgroup><optgroup label="B"><option value="B1">B1</option>\n<option value="B2">B2</option></optgroup></select></div>',
      view.select("post", "category", groupedOptions),
    );
  });

  it("collection select with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><select name="post[author_name]" id="post_author_name"><option value="a">a</option>\n<option value="b">b</option></select></div>',
      view.collectionSelect("post", "author_name", ["a", "b"], "toString", "toString"),
    );
  });

  // BLOCKED: date-seat-answers-change-for-date-select
  it.skip("date select with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><select id="post_updated_at_1i" name="post[updated_at(1i)]">\n<option selected="selected" value="2004">2004</option>\n<option value="2005">2005</option>\n</select>\n<input id="post_updated_at_2i" name="post[updated_at(2i)]" type="hidden" value="6" autocomplete="off" />\n<input id="post_updated_at_3i" name="post[updated_at(3i)]" type="hidden" value="1" autocomplete="off" />\n</div>',
      view.dateSelect("post", "updated_at", {
        discardMonth: true,
        discardDay: true,
        startYear: 2004,
        endYear: 2005,
      }),
    );
  });

  // BLOCKED: date-seat-answers-change-for-date-select
  it.skip("datetime select with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><input id="post_updated_at_1i" name="post[updated_at(1i)]" type="hidden" value="2004" autocomplete="off" />\n<input id="post_updated_at_2i" name="post[updated_at(2i)]" type="hidden" value="6" autocomplete="off" />\n<input id="post_updated_at_3i" name="post[updated_at(3i)]" type="hidden" value="1" autocomplete="off" />\n<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n<option selected="selected" value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="post_updated_at_5i" name="post[updated_at(5i)]">\n<option selected="selected" value="00">00</option>\n</select>\n</div>',
      view.datetimeSelect("post", "updated_at", {
        discardYear: true,
        discardMonth: true,
        discardDay: true,
        minuteStep: 60,
      }),
    );
  });

  // BLOCKED: date-seat-answers-change-for-date-select
  it.skip("time select with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><input id="post_updated_at_1i" name="post[updated_at(1i)]" type="hidden" value="2004" autocomplete="off" />\n<input id="post_updated_at_2i" name="post[updated_at(2i)]" type="hidden" value="6" autocomplete="off" />\n<input id="post_updated_at_3i" name="post[updated_at(3i)]" type="hidden" value="15" autocomplete="off" />\n<select id="post_updated_at_4i" name="post[updated_at(4i)]">\n<option selected="selected" value="00">00</option>\n<option value="01">01</option>\n<option value="02">02</option>\n<option value="03">03</option>\n<option value="04">04</option>\n<option value="05">05</option>\n<option value="06">06</option>\n<option value="07">07</option>\n<option value="08">08</option>\n<option value="09">09</option>\n<option value="10">10</option>\n<option value="11">11</option>\n<option value="12">12</option>\n<option value="13">13</option>\n<option value="14">14</option>\n<option value="15">15</option>\n<option value="16">16</option>\n<option value="17">17</option>\n<option value="18">18</option>\n<option value="19">19</option>\n<option value="20">20</option>\n<option value="21">21</option>\n<option value="22">22</option>\n<option value="23">23</option>\n</select>\n : <select id="post_updated_at_5i" name="post[updated_at(5i)]">\n<option selected="selected" value="00">00</option>\n</select>\n</div>',
      view.timeSelect("post", "updated_at", { minuteStep: 60 }),
    );
  });

  it("label with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><label for="post_body">Body</label></div>',
      view.label("post", "body"),
    );
  });

  it("checkbox with errors", () => {
    assertDomEqual(
      '<input name="post[published]" type="hidden" value="0" autocomplete="off" /><div class="field_with_errors"><input type="checkbox" value="1" name="post[published]" id="post_published" /></div>',
      view.checkbox("post", "published"),
    );
  });

  it("checkboxes with errors", () => {
    assertDomEqual(
      '<input name="post[published]" type="hidden" value="0" autocomplete="off" /><div class="field_with_errors"><input type="checkbox" value="1" name="post[published]" id="post_published" /></div><input name="post[published]" type="hidden" value="0" autocomplete="off" /><div class="field_with_errors"><input type="checkbox" value="1" name="post[published]" id="post_published" /></div>',
      String(view.checkbox("post", "published")) + String(view.checkbox("post", "published")),
    );
  });

  it("radio button with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><input type="radio" value="rails" checked="checked" name="post[category]" id="post_category_rails" /></div>',
      view.radioButton("post", "category", "rails"),
    );
  });

  it("radio buttons with errors", () => {
    assertDomEqual(
      '<div class="field_with_errors"><input type="radio" value="rails" checked="checked" name="post[category]" id="post_category_rails" /></div><div class="field_with_errors"><input type="radio" value="java" name="post[category]" id="post_category_java" /></div>',
      String(view.radioButton("post", "category", "rails")) +
        String(view.radioButton("post", "category", "java")),
    );
  });

  it("collection checkboxes with errors", () => {
    assertDomEqual(
      '<input type="hidden" name="post[category][]" value="" autocomplete="off" /><div class="field_with_errors"><input type="checkbox" value="ruby" name="post[category][]" id="post_category_ruby" /></div><label for="post_category_ruby">ruby</label><div class="field_with_errors"><input type="checkbox" value="java" name="post[category][]" id="post_category_java" /></div><label for="post_category_java">java</label>',
      view.collectionCheckboxes("post", "category", ["ruby", "java"], "toString", "toString"),
    );
  });

  it("collection radio buttons with errors", () => {
    assertDomEqual(
      '<input type="hidden" name="post[category]" value="" autocomplete="off" /><div class="field_with_errors"><input type="radio" value="ruby" name="post[category]" id="post_category_ruby" /></div><label for="post_category_ruby">ruby</label><div class="field_with_errors"><input type="radio" value="java" name="post[category]" id="post_category_java" /></div><label for="post_category_java">java</label>',
      view.collectionRadioButtons("post", "category", ["ruby", "java"], "toString", "toString"),
    );
  });

  it("hidden field does not render errors", () => {
    assertDomEqual(
      '<input id="post_author_name" name="post[author_name]" type="hidden" value="" autocomplete="off" />',
      view.hiddenField("post", "author_name"),
    );
  });

  it("field error proc", () => {
    const oldProc = Base.fieldErrorProc;
    try {
      Base.fieldErrorProc = function (htmlTag, instance) {
        return raw(
          `<div class="field_with_errors">${htmlTag} <span class="error">${[(instance as { errorMessage(): unknown }).errorMessage()].flat(Infinity).join(", ")}</span></div>`,
        );
      };

      assertDomEqual(
        '<div class="field_with_errors"><input id="post_author_name" name="post[author_name]" type="text" value="" /> <span class="error">can\'t be empty</span></div>',
        view.textField("post", "author_name"),
      );
    } finally {
      Base.fieldErrorProc = oldProc;
    }
  });
});
