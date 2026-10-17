/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { beforeEach, describe, it } from "vitest";
import { Struct } from "@blazetrails/ruby-compat";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

const Category = Struct.new("id", "name");

type View = Base & Record<string, any>;

describe("FormCollectionsHelper (trails)", () => {
  let view: View;
  const collection = () => [new Category(1, "Category 1"), new Category(2, "Category 2")];

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as View;
  });

  it("collection radio buttons render a hidden field, inputs and labels", () => {
    assertDomEqual(
      '<input type="hidden" name="user[active]" value="" autocomplete="off" /><input type="radio" value="true" checked="checked" name="user[active]" id="user_active_true" /><label for="user_active_true">1</label><input type="radio" value="false" name="user[active]" id="user_active_false" /><label for="user_active_false">0</label>',
      view.collectionRadioButtons(
        "user",
        "active",
        [
          [1, true],
          [0, false],
        ],
        "last",
        "first",
        {
          checked: true,
        },
      ),
    );
  });

  it("collection check boxes index the hidden field and pass :form to it", () => {
    assertDomEqual(
      '<input type="hidden" name="user[322][category_ids][]" value="" form="f" autocomplete="off" /><input form="f" type="checkbox" value="1" name="user[category_ids][]" id="user_category_ids_1" /><label for="user_category_ids_1">Category 1</label><input form="f" type="checkbox" value="2" name="user[category_ids][]" id="user_category_ids_2" /><label for="user_category_ids_2">Category 2</label>',
      view.collectionCheckboxes(
        "user",
        "category_ids",
        collection(),
        "id",
        "name",
        { index: 322 },
        { form: "f" },
      ),
    );
  });

  it("collection check boxes capture a block with the builder", () => {
    assertDomEqual(
      '<input type="hidden" name="user[active][]" value="" autocomplete="off" /><label data-value="true" for="user_active_true"><input type="checkbox" value="true" name="user[active][]" id="user_active_true" />true</label><label data-value="false" for="user_active_false"><input type="checkbox" value="false" name="user[active][]" id="user_active_false" />false</label>',
      view.collectionCheckboxes(
        "user",
        "active",
        [true, false],
        "toString",
        "toString",
        {},
        {},
        (b: any) => b.label({ "data-value": b.value }, () => b.checkbox().plus(b.text)),
      ),
    );
  });

  it("collection check boxes skip the hidden field when include_hidden is false", () => {
    assertDomEqual(
      '<input type="checkbox" value="1" name="user[category_ids][]" id="user_category_ids_1" /><label for="user_category_ids_1">Category 1</label><input type="checkbox" value="2" name="user[category_ids][]" id="user_category_ids_2" /><label for="user_category_ids_2">Category 2</label>',
      view.collectionCheckboxes("user", "category_ids", collection(), "id", "name", {
        includeHidden: false,
      }),
    );
  });

  it("form builder collection radio buttons", () => {
    assertDomEqual(
      '<input type="hidden" name="post[category_id]" value="" autocomplete="off" /><input type="radio" value="1" name="post[category_id]" id="post_category_id_1" /><label for="post_category_id_1">Category 1</label><input type="radio" value="2" name="post[category_id]" id="post_category_id_2" /><label for="post_category_id_2">Category 2</label>',
      view.fieldsFor("post", null, {}, (p: any) =>
        p.collectionRadioButtons("category_id", collection(), "id", "name"),
      ),
    );
  });
});
