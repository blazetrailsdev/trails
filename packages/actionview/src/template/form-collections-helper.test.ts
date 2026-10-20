/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, it } from "vitest";
import { Struct } from "@blazetrails/ruby-compat";
import "../test-helpers/abstract-unit.js";
import { TestCase } from "../test-case.js";

const Category = Struct.new("id", "name");

type Tc = Record<string, any>;

class FormCollectionsHelperTest extends TestCase {
  assertNoSelect(this: Tc, selector: string, value: unknown = null) {
    this.assertSelect(selector, { text: value, count: 0 });
  }

  withCollectionRadioButtons(this: Tc, ...args: unknown[]) {
    this.rendered = this.collectionRadioButtons(...args);
  }

  withCollectionCheckboxes(this: Tc, ...args: unknown[]) {
    this.rendered = this.collectionCheckboxes(...args);
  }
}

describe("FormCollectionsHelperTest", () => {
  let tc: Tc;
  beforeEach(async ({ task }) => {
    tc = new FormCollectionsHelperTest(task.name) as unknown as Tc;
    await tc.beforeSetup();
    tc.setup();
  });
  const range3 = () => [1, 2, 3].map((i) => [i, `Category ${i}`]);
  const categories = () => [new Category(1, "Category 1"), new Category(2, "Category 2")];

  it("collection radio accepts a collection and generates inputs from value method", () => {
    tc.withCollectionRadioButtons("user", "active", [true, false], "toString", "toString");

    tc.assertSelect("input[type=radio][value=true]#user_active_true");
    tc.assertSelect("input[type=radio][value=false]#user_active_false");
  });

  it("collection radio accepts a collection and generates inputs from label method", () => {
    tc.withCollectionRadioButtons("user", "active", [true, false], "toString", "toString");

    tc.assertSelect("label[for=user_active_true]", "true");
    tc.assertSelect("label[for=user_active_false]", "false");
  });

  it("collection radio handles camelized collection values for labels correctly", () => {
    tc.withCollectionRadioButtons("user", "active", ["Yes", "No"], "toString", "toString");

    tc.assertSelect("label[for=user_active_yes]", "Yes");
    tc.assertSelect("label[for=user_active_no]", "No");
  });

  it("collection radio generates labels for non-English values correctly", () => {
    tc.withCollectionRadioButtons("user", "title", ["Господин", "Госпожа"], "toString", "toString");

    tc.assertSelect("input[type=radio]#user_title_господин");
    tc.assertSelect("label[for=user_title_господин]", "Господин");
  });

  it("collection radio should sanitize collection values for labels correctly", () => {
    tc.withCollectionRadioButtons("user", "name", ["$0.99", "$1.99"], "toString", "toString");
    tc.assertSelect("label[for=user_name_0_99]", "$0.99");
    tc.assertSelect("label[for=user_name_1_99]", "$1.99");
  });

  // PERMANENT-SKIP: Ruby's 1.0.to_s is "1.0"; a JS number 1.0 renders as "1".
  it.skip("collection radio correctly builds unique DOM IDs for float values", () => {
    tc.withCollectionRadioButtons("user", "name", [1.0, 10], "toString", "toString");
    tc.assertSelect("label[for=user_name_1_0]", "1.0");
    tc.assertSelect("label[for=user_name_10]", "10");
    tc.assertSelect('input#user_name_1_0[type=radio][value="1.0"]');
    tc.assertSelect('input#user_name_10[type=radio][value="10"]');
  });

  it("collection radio accepts checked item", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [
        [1, true],
        [0, false],
      ],
      "last",
      "first",
      { checked: true },
    );

    tc.assertSelect("input[type=radio][value=true][checked=checked]");
    tc.assertNoSelect("input[type=radio][value=false][checked=checked]");
  });

  it("collection radio accepts multiple disabled items", () => {
    const collection = [
      [1, true],
      [0, false],
      [2, "other"],
    ];
    tc.withCollectionRadioButtons("user", "active", collection, "last", "first", {
      disabled: [true, false],
    });

    tc.assertSelect("input[type=radio][value=true][disabled=disabled]");
    tc.assertSelect("input[type=radio][value=false][disabled=disabled]");
    tc.assertNoSelect("input[type=radio][value=other][disabled=disabled]");
  });

  it("collection radio accepts single disabled item", () => {
    const collection = [
      [1, true],
      [0, false],
    ];
    tc.withCollectionRadioButtons("user", "active", collection, "last", "first", {
      disabled: true,
    });

    tc.assertSelect("input[type=radio][value=true][disabled=disabled]");
    tc.assertNoSelect("input[type=radio][value=false][disabled=disabled]");
  });

  it("collection radio accepts multiple readonly items", () => {
    const collection = [
      [1, true],
      [0, false],
      [2, "other"],
    ];
    tc.withCollectionRadioButtons("user", "active", collection, "last", "first", {
      readonly: [true, false],
    });

    tc.assertSelect("input[type=radio][value=true][readonly=readonly]");
    tc.assertSelect("input[type=radio][value=false][readonly=readonly]");
    tc.assertNoSelect("input[type=radio][value=other][readonly=readonly]");
  });

  it("collection radio accepts single readonly item", () => {
    const collection = [
      [1, true],
      [0, false],
    ];
    tc.withCollectionRadioButtons("user", "active", collection, "last", "first", {
      readonly: true,
    });

    tc.assertSelect("input[type=radio][value=true][readonly=readonly]");
    tc.assertNoSelect("input[type=radio][value=false][readonly=readonly]");
  });

  it("collection radio accepts HTML options as input", () => {
    const collection = [
      [1, true],
      [0, false],
    ];
    tc.withCollectionRadioButtons(
      "user",
      "active",
      collection,
      "last",
      "first",
      {},
      { class: "special-radio" },
    );

    tc.assertSelect("input[type=radio][value=true].special-radio#user_active_true");
    tc.assertSelect("input[type=radio][value=false].special-radio#user_active_false");
  });

  it("collection radio accepts HTML options as the last element of array", () => {
    const collection = [
      [1, true, { class: "foo" }],
      [0, false, { class: "bar" }],
    ];
    tc.withCollectionRadioButtons("user", "active", collection, "second", "first");

    tc.assertSelect("input[type=radio][value=true].foo#user_active_true");
    tc.assertSelect("input[type=radio][value=false].bar#user_active_false");
  });

  it("collection radio sets the label class defined inside the block", () => {
    const collection = [
      [1, true, { class: "foo" }],
      [0, false, { class: "bar" }],
    ];
    tc.withCollectionRadioButtons(
      "user",
      "active",
      collection,
      "second",
      "first",
      {},
      {},
      (b: any) => b.label({ class: "collection_radio_buttons" }),
    );

    tc.assertSelect("label.collection_radio_buttons[for=user_active_true]");
    tc.assertSelect("label.collection_radio_buttons[for=user_active_false]");
  });

  it("collection radio does not include the input class in the respective label", () => {
    const collection = [
      [1, true, { class: "foo" }],
      [0, false, { class: "bar" }],
    ];
    tc.withCollectionRadioButtons("user", "active", collection, "second", "first");

    tc.assertNoSelect("label.foo[for=user_active_true]");
    tc.assertNoSelect("label.bar[for=user_active_false]");
  });

  it("collection radio does not wrap input inside the label", () => {
    tc.withCollectionRadioButtons("user", "active", [true, false], "toString", "toString");

    tc.assertSelect("input[type=radio] + label");
    tc.assertNoSelect("label input");
  });

  it("collection radio accepts a block to render the label as radio button wrapper", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label(undefined, () => b.radioButton()),
    );

    tc.assertSelect("label[for=user_active_true] > input#user_active_true[type=radio]");
    tc.assertSelect("label[for=user_active_false] > input#user_active_false[type=radio]");
  });

  it("collection radio accepts a block to change the order of label and radio button", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label().plus(b.radioButton()),
    );

    tc.assertSelect("label[for=user_active_true] + input#user_active_true[type=radio]");
    tc.assertSelect("label[for=user_active_false] + input#user_active_false[type=radio]");
  });

  it("collection radio with block helpers accept extra HTML options", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label({ class: "radio_button" }).plus(b.radioButton({ class: "radio_button" })),
    );

    tc.assertSelect(
      "label.radio_button[for=user_active_true] + input#user_active_true.radio_button[type=radio]",
    );
    tc.assertSelect(
      "label.radio_button[for=user_active_false] + input#user_active_false.radio_button[type=radio]",
    );
  });

  it("collection radio with block helpers allows access to current text and value", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label({ "data-value": b.value }, () => b.radioButton().plus(b.text)),
    );

    tc.assertSelect("label[for=user_active_true][data-value=true]", "true", () => {
      tc.assertSelect("input#user_active_true[type=radio]");
    });
    tc.assertSelect("label[for=user_active_false][data-value=false]", "false", () => {
      tc.assertSelect("input#user_active_false[type=radio]");
    });
  });

  it("collection radio with block helpers allows access to the current object item in the collection to access extra properties", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label({ class: b.object }, () => b.radioButton().plus(b.text)),
    );

    tc.assertSelect("label.true[for=user_active_true]", "true", () => {
      tc.assertSelect("input#user_active_true[type=radio]");
    });
    tc.assertSelect("label.false[for=user_active_false]", "false", () => {
      tc.assertSelect("input#user_active_false[type=radio]");
    });
  });

  it("collection radio buttons with fields for", () => {
    const collection = categories();
    tc.rendered = tc.fieldsFor("post", null, {}, (p: any) =>
      p.collectionRadioButtons("category_id", collection, "id", "name"),
    );

    tc.assertSelect('input#post_category_id_1[type=radio][value="1"]');
    tc.assertSelect('input#post_category_id_2[type=radio][value="2"]');

    tc.assertSelect("label[for=post_category_id_1]", "Category 1");
    tc.assertSelect("label[for=post_category_id_2]", "Category 2");
  });

  it("collection radio accepts checked item which has a value of false", () => {
    tc.withCollectionRadioButtons(
      "user",
      "active",
      [
        [1, true],
        [0, false],
      ],
      "last",
      "first",
      { checked: false },
    );
    tc.assertNoSelect("input[type=radio][value=true][checked=checked]");
    tc.assertSelect("input[type=radio][value=false][checked=checked]");
  });

  it("collection radio buttons generates only one hidden field for the entire collection, to ensure something will be sent back to the server when posting an empty collection", () => {
    const collection = categories();
    tc.withCollectionRadioButtons("user", "category_ids", collection, "id", "name");

    tc.assertSelect("input[type=hidden][name='user[category_ids]'][value=''][autocomplete='off']", {
      count: 1,
    });
  });

  it("collection radio buttons generates a hidden field using the given :name in :html_options", () => {
    const collection = categories();
    tc.withCollectionRadioButtons(
      "user",
      "category_ids",
      collection,
      "id",
      "name",
      {},
      { name: "user[other_category_ids]" },
    );

    tc.assertSelect(
      "input[type=hidden][name='user[other_category_ids]'][value=''][autocomplete='off']",
      { count: 1 },
    );
  });

  it("collection radio buttons generates a hidden field with index if it was provided", () => {
    const collection = categories();
    tc.withCollectionRadioButtons("user", "category_ids", collection, "id", "name", {
      index: 322,
    });

    tc.assertSelect(
      "input[type=hidden][name='user[322][category_ids]'][value=''][autocomplete='off']",
      { count: 1 },
    );
  });

  it("collection radio buttons does not generate a hidden field if include_hidden option is false", () => {
    const collection = categories();
    tc.withCollectionRadioButtons("user", "category_ids", collection, "id", "name", {
      includeHidden: false,
    });

    tc.assertSelect("input[type=hidden][name='user[category_ids]'][value='']", { count: 0 });
  });

  it("collection radio buttons does not generate a hidden field if include_hidden option is false with key as string", () => {
    const collection = categories();
    tc.withCollectionRadioButtons("user", "category_ids", collection, "id", "name", {
      includeHidden: false,
    });

    tc.assertSelect("input[type=hidden][name='user[category_ids]'][value='']", { count: 0 });
  });

  it("collection check boxes accepts a collection and generate a series of checkboxes for value method", () => {
    const collection = categories();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "id", "name");

    tc.assertSelect('input#user_category_ids_1[type=checkbox][value="1"]');
    tc.assertSelect('input#user_category_ids_2[type=checkbox][value="2"]');
  });

  it("collection check boxes generates only one hidden field for the entire collection, to ensure something will be sent back to the server when posting an empty collection", () => {
    const collection = categories();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "id", "name");

    tc.assertSelect(
      "input[type=hidden][name='user[category_ids][]'][value=''][autocomplete='off']",
      { count: 1 },
    );
  });

  it("collection check boxes generates a hidden field using the given :name in :html_options", () => {
    const collection = categories();
    tc.withCollectionCheckboxes(
      "user",
      "category_ids",
      collection,
      "id",
      "name",
      {},
      { name: "user[other_category_ids][]" },
    );

    tc.assertSelect(
      "input[type=hidden][name='user[other_category_ids][]'][value=''][autocomplete='off']",
      { count: 1 },
    );
  });

  it("collection check boxes generates a hidden field using the given :form in :html_options", () => {
    const collection = categories();
    tc.withCollectionCheckboxes(
      "user",
      "category_ids",
      collection,
      "id",
      "name",
      {},
      { form: "my_form" },
    );

    tc.assertSelect("input[type=hidden][value=''][autocomplete='off'][form='my_form']", {
      count: 1,
    });
  });

  it("collection check boxes generates a hidden field with index if it was provided", () => {
    const collection = categories();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "id", "name", { index: 322 });

    tc.assertSelect(
      "input[type=hidden][name='user[322][category_ids][]'][value=''][autocomplete='off']",
      { count: 1 },
    );
  });

  it("collection check boxes does not generate a hidden field if include_hidden option is false", () => {
    const collection = categories();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "id", "name", {
      includeHidden: false,
    });

    tc.assertSelect("input[type=hidden][name='user[category_ids][]'][value='']", { count: 0 });
  });

  it("collection check boxes does not generate a hidden field if include_hidden option is false with key as string", () => {
    const collection = categories();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "id", "name", {
      includeHidden: false,
    });

    tc.assertSelect("input[type=hidden][name='user[category_ids][]'][value='']", { count: 0 });
  });

  it("collection check boxes accepts a collection and generate a series of checkboxes with labels for label method", () => {
    const collection = categories();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "id", "name");

    tc.assertSelect("label[for=user_category_ids_1]", "Category 1");
    tc.assertSelect("label[for=user_category_ids_2]", "Category 2");
  });

  it("collection check boxes handles camelized collection values for labels correctly", () => {
    tc.withCollectionCheckboxes("user", "active", ["Yes", "No"], "toString", "toString");

    tc.assertSelect("label[for=user_active_yes]", "Yes");
    tc.assertSelect("label[for=user_active_no]", "No");
  });

  it("collection check box should sanitize collection values for labels correctly", () => {
    tc.withCollectionCheckboxes("user", "name", ["$0.99", "$1.99"], "toString", "toString");
    tc.assertSelect("label[for=user_name_0_99]", "$0.99");
    tc.assertSelect("label[for=user_name_1_99]", "$1.99");
  });

  // PERMANENT-SKIP: Ruby's 1.0.to_s is "1.0"; a JS number 1.0 renders as "1".
  it.skip("collection check boxes correctly builds unique DOM IDs for float values", () => {
    tc.withCollectionCheckboxes("user", "name", [1.0, 10], "toString", "toString");
    tc.assertSelect("label[for=user_name_1_0]", "1.0");
    tc.assertSelect("label[for=user_name_10]", "10");
    tc.assertSelect('input#user_name_1_0[type=checkbox][value="1.0"]');
    tc.assertSelect('input#user_name_10[type=checkbox][value="10"]');
  });

  it("collection check boxes generates labels for non-English values correctly", () => {
    tc.withCollectionCheckboxes("user", "title", ["Господин", "Госпожа"], "toString", "toString");

    tc.assertSelect("input[type=checkbox]#user_title_господин");
    tc.assertSelect("label[for=user_title_господин]", "Господин");
  });

  it("collection check boxes accepts HTML options as the last element of array", () => {
    const collection = [
      [1, "Category 1", { class: "foo" }],
      [2, "Category 2", { class: "bar" }],
    ];
    tc.withCollectionCheckboxes("user", "active", collection, "first", "second");

    tc.assertSelect('input[type=checkbox][value="1"].foo');
    tc.assertSelect('input[type=checkbox][value="2"].bar');
  });

  it("collection check boxes propagates input id to the label for attribute", () => {
    const collection = [
      [1, "Category 1", { id: "foo" }],
      [2, "Category 2", { id: "bar" }],
    ];
    tc.withCollectionCheckboxes("user", "active", collection, "first", "second");

    tc.assertSelect('input[type=checkbox][value="1"]#foo');
    tc.assertSelect('input[type=checkbox][value="2"]#bar');

    tc.assertSelect("label[for=foo]");
    tc.assertSelect("label[for=bar]");
  });

  it("collection check boxes sets the label class defined inside the block", () => {
    const collection = [
      [1, "Category 1", { class: "foo" }],
      [2, "Category 2", { class: "bar" }],
    ];
    tc.withCollectionCheckboxes("user", "active", collection, "second", "first", {}, {}, (b: any) =>
      b.label({ class: "collection_checkboxes" }),
    );

    tc.assertSelect("label.collection_checkboxes[for=user_active_category_1]");
    tc.assertSelect("label.collection_checkboxes[for=user_active_category_2]");
  });

  it("collection check boxes does not include the input class in the respective label", () => {
    const collection = [
      [1, "Category 1", { class: "foo" }],
      [2, "Category 2", { class: "bar" }],
    ];
    tc.withCollectionCheckboxes("user", "active", collection, "second", "first");

    tc.assertNoSelect("label.foo[for=user_active_category_1]");
    tc.assertNoSelect("label.bar[for=user_active_category_2]");
  });

  it("collection check boxes accepts selected values as :checked option", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      checked: [1, 3],
    });

    tc.assertSelect('input[type=checkbox][value="1"][checked=checked]');
    tc.assertSelect('input[type=checkbox][value="3"][checked=checked]');
    tc.assertNoSelect('input[type=checkbox][value="2"][checked=checked]');
  });

  it("collection check boxes accepts selected string values as :checked option", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      checked: ["1", "3"],
    });

    tc.assertSelect('input[type=checkbox][value="1"][checked=checked]');
    tc.assertSelect('input[type=checkbox][value="3"][checked=checked]');
    tc.assertNoSelect('input[type=checkbox][value="2"][checked=checked]');
  });

  it("collection check boxes accepts a single checked value", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      checked: 3,
    });

    tc.assertSelect('input[type=checkbox][value="3"][checked=checked]');
    tc.assertNoSelect('input[type=checkbox][value="1"][checked=checked]');
    tc.assertNoSelect('input[type=checkbox][value="2"][checked=checked]');
  });

  it("collection check boxes accepts selected values as :checked option and override the model values", () => {
    const user = new (Struct.new("category_ids"))(2);
    const collection = range3();

    tc.rendered = tc.fieldsFor("user", user, {}, (p: any) =>
      p.collectionCheckboxes("category_ids", collection, "first", "last", { checked: [1, 3] }),
    );

    tc.assertSelect('input[type=checkbox][value="1"][checked=checked]');
    tc.assertSelect('input[type=checkbox][value="3"][checked=checked]');
    tc.assertNoSelect('input[type=checkbox][value="2"][checked=checked]');
  });

  it("collection check boxes accepts multiple disabled items", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      disabled: [1, 3],
    });

    tc.assertSelect('input[type=checkbox][value="1"][disabled=disabled]');
    tc.assertSelect('input[type=checkbox][value="3"][disabled=disabled]');
    tc.assertNoSelect('input[type=checkbox][value="2"][disabled=disabled]');
  });

  it("collection check boxes accepts single disabled item", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      disabled: 1,
    });

    tc.assertSelect('input[type=checkbox][value="1"][disabled=disabled]');
    tc.assertNoSelect('input[type=checkbox][value="3"][disabled=disabled]');
    tc.assertNoSelect('input[type=checkbox][value="2"][disabled=disabled]');
  });

  it("collection check boxes accepts a proc to disabled items", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      disabled: (i: unknown[]) => i[0] === 1,
    });

    tc.assertSelect('input[type=checkbox][value="1"][disabled=disabled]');
    tc.assertNoSelect('input[type=checkbox][value="3"][disabled=disabled]');
    tc.assertNoSelect('input[type=checkbox][value="2"][disabled=disabled]');
  });

  it("collection check boxes accepts multiple readonly items", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      readonly: [1, 3],
    });

    tc.assertSelect('input[type=checkbox][value="1"][readonly=readonly]');
    tc.assertSelect('input[type=checkbox][value="3"][readonly=readonly]');
    tc.assertNoSelect('input[type=checkbox][value="2"][readonly=readonly]');
  });

  it("collection check boxes accepts single readonly item", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      readonly: 1,
    });

    tc.assertSelect('input[type=checkbox][value="1"][readonly=readonly]');
    tc.assertNoSelect('input[type=checkbox][value="3"][readonly=readonly]');
    tc.assertNoSelect('input[type=checkbox][value="2"][readonly=readonly]');
  });

  it("collection check boxes accepts a proc to readonly items", () => {
    const collection = range3();
    tc.withCollectionCheckboxes("user", "category_ids", collection, "first", "last", {
      readonly: (i: unknown[]) => i[0] === 1,
    });

    tc.assertSelect('input[type=checkbox][value="1"][readonly=readonly]');
    tc.assertNoSelect('input[type=checkbox][value="3"][readonly=readonly]');
    tc.assertNoSelect('input[type=checkbox][value="2"][readonly=readonly]');
  });

  it("collection check boxes accepts HTML options", () => {
    const collection = [
      [1, "Category 1"],
      [2, "Category 2"],
    ];
    tc.withCollectionCheckboxes(
      "user",
      "category_ids",
      collection,
      "first",
      "last",
      {},
      { class: "check" },
    );

    tc.assertSelect('input.check[type=checkbox][value="1"]');
    tc.assertSelect('input.check[type=checkbox][value="2"]');
  });

  it("collection check boxes with fields for", () => {
    const collection = categories();
    tc.rendered = tc.fieldsFor("post", null, {}, (p: any) =>
      p.collectionCheckboxes("category_ids", collection, "id", "name"),
    );

    tc.assertSelect('input#post_category_ids_1[type=checkbox][value="1"]');
    tc.assertSelect('input#post_category_ids_2[type=checkbox][value="2"]');

    tc.assertSelect("label[for=post_category_ids_1]", "Category 1");
    tc.assertSelect("label[for=post_category_ids_2]", "Category 2");
  });

  it("collection check boxes does not wrap input inside the label", () => {
    tc.withCollectionCheckboxes("user", "active", [true, false], "toString", "toString");

    tc.assertSelect("input[type=checkbox] + label");
    tc.assertNoSelect("label input");
  });

  it("collection check boxes accepts a block to render the label as check box wrapper", () => {
    tc.withCollectionCheckboxes(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label(undefined, () => b.checkbox()),
    );

    tc.assertSelect("label[for=user_active_true] > input#user_active_true[type=checkbox]");
    tc.assertSelect("label[for=user_active_false] > input#user_active_false[type=checkbox]");
  });

  it("collection check boxes accepts a block to change the order of label and check box", () => {
    tc.withCollectionCheckboxes(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label().plus(b.checkbox()),
    );

    tc.assertSelect("label[for=user_active_true] + input#user_active_true[type=checkbox]");
    tc.assertSelect("label[for=user_active_false] + input#user_active_false[type=checkbox]");
  });

  it("collection check boxes with block helpers accept extra HTML options", () => {
    tc.withCollectionCheckboxes(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label({ class: "checkbox" }).plus(b.checkbox({ class: "checkbox" })),
    );

    tc.assertSelect(
      "label.checkbox[for=user_active_true] + input#user_active_true.checkbox[type=checkbox]",
    );
    tc.assertSelect(
      "label.checkbox[for=user_active_false] + input#user_active_false.checkbox[type=checkbox]",
    );
  });

  it("collection check boxes with block helpers allows access to current text and value", () => {
    tc.withCollectionCheckboxes(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label({ "data-value": b.value }, () => b.checkbox().plus(b.text)),
    );

    tc.assertSelect("label[for=user_active_true][data-value=true]", "true", () => {
      tc.assertSelect("input#user_active_true[type=checkbox]");
    });
    tc.assertSelect("label[for=user_active_false][data-value=false]", "false", () => {
      tc.assertSelect("input#user_active_false[type=checkbox]");
    });
  });

  it("collection check boxes with block helpers allows access to the current object item in the collection to access extra properties", () => {
    tc.withCollectionCheckboxes(
      "user",
      "active",
      [true, false],
      "toString",
      "toString",
      {},
      {},
      (b: any) => b.label({ class: b.object }, () => b.checkbox().plus(b.text)),
    );

    tc.assertSelect("label.true[for=user_active_true]", "true", () => {
      tc.assertSelect("input#user_active_true[type=checkbox]");
    });
    tc.assertSelect("label.false[for=user_active_false]", "false", () => {
      tc.assertSelect("input#user_active_false[type=checkbox]");
    });
  });
});
