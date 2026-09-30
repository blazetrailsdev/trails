import { describe, it, expect } from "vitest";
import { GeneratedAttribute, GeneratorError } from "./generated-attribute.js";
import { assertFieldDefaultValue, assertFieldType } from "./testing/assertions.js";

describe("GeneratedAttribute", () => {
  it("test_field_name_with_dangerous_attribute_raises_error", () => {
    const message = "Could not generate field 'save', as it is already defined by Active Record.";
    expect(() => GeneratedAttribute.parse("save:string")).toThrow(GeneratorError);
    expect(() => GeneratedAttribute.parse("save:string")).toThrow(message);
  });

  it("test_field_type_returns_number_field", () => {
    assertFieldType("integer", "number_field");
  });

  it("test_field_type_returns_text_field", () => {
    for (const attributeType of ["float", "decimal", "string"]) {
      assertFieldType(attributeType, "text_field");
    }
  });

  it("test_field_type_returns_datetime_select", () => {
    for (const attributeType of ["datetime", "timestamp"]) {
      assertFieldType(attributeType, "datetime_field");
    }
  });

  it("test_field_type_returns_time_select", () => {
    assertFieldType("time", "time_field");
  });

  it("test_field_type_returns_date_select", () => {
    assertFieldType("date", "date_field");
  });

  it("test_field_type_returns_textarea", () => {
    assertFieldType("text", "textarea");
  });

  it("test_field_type_returns_checkbox", () => {
    assertFieldType("boolean", "checkbox");
  });

  it("test_field_type_returns_rich_textarea", () => {
    assertFieldType("rich_text", "rich_textarea");
  });

  it("test_field_type_returns_file_field", () => {
    for (const attributeType of ["attachment", "attachments"]) {
      assertFieldType(attributeType, "file_field");
    }
  });

  it("test_decimal_precision_and_scale_options", () => {
    const dec = GeneratedAttribute.parse("price:decimal{10,2}");
    expect([dec.type, dec.attrOptions.precision, dec.attrOptions.scale, dec.toString()]).toEqual([
      "decimal",
      10,
      2,
      "price:decimal{10,2}",
    ]);
    expect(GeneratedAttribute.parse("title:string!").attrOptions.null).toBe(false);
    const email = GeneratedAttribute.parse("email:index");
    expect([email.type, email.hasIndex()]).toEqual(["string", true]);
    const uniq = GeneratedAttribute.parse("post:references:uniq");
    expect([uniq.attrOptions.index, uniq.hasUniqIndex()]).toEqual([{ unique: true }, true]);
  });

  it("test_virtual_password_digest_token_and_foreign_key", () => {
    expect(GeneratedAttribute.parse("body:rich_text").virtual()).toBe(true);
    expect(GeneratedAttribute.parse("title:string").virtual()).toBe(false);
    expect(GeneratedAttribute.parse("password:digest").passwordDigest()).toBe(true);
    expect(GeneratedAttribute.parse("api:token").token()).toBe(true);
    expect(GeneratedAttribute.parse("post_id:integer").foreignKey()).toBe(true);
    const a = GeneratedAttribute.parse("post_id:integer");
    expect([a.singularName(), a.pluralName()]).toEqual(["post", "posts"]);
  });

  it("test_field_type_with_unknown_type_raises_error", () => {
    expect(() => GeneratedAttribute.parse("title:bogus")).toThrow(GeneratorError);
    expect(() => GeneratedAttribute.parse("title:string:bogus")).toThrow(GeneratorError);
  });

  it("test_human_name", () => {
    expect(GeneratedAttribute.parse("first_name:string").humanName()).toBe("First name");
    expect(GeneratedAttribute.parse("title").type).toBe("string");
  });

  it("test_size_option_can_be_passed_to_string_text_and_binary", () => {
    expect(GeneratedAttribute.parse("notes:text{medium}").attrOptions.size).toBe("medium");
    expect(GeneratedAttribute.parse("title:string{40}").attrOptions.limit).toBe(40);
  });

  it("test_reference_is_true", () => {
    expect(GeneratedAttribute.parse("post:references").reference()).toBe(true);
    expect(GeneratedAttribute.parse("title:string").reference()).toBe(false);
    expect(GeneratedAttribute.parse("post:references{polymorphic}").polymorphic()).toBe(true);
  });

  it("test_default_value_is_integer", () => {
    assertFieldDefaultValue("integer", 1);
  });

  it("test_default_value_is_float", () => {
    assertFieldDefaultValue("float", 1.5);
  });

  it("test_default_value_is_decimal", () => {
    assertFieldDefaultValue("decimal", "9.99");
  });

  it("test_default_value_is_datetime", () => {
    for (const t of ["datetime", "timestamp", "time"]) {
      const val = GeneratedAttribute.parse(`at:${t}`).default();
      expect(typeof val).toBe("string");
      expect(val).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    }
  });

  it("test_default_value_is_date", () => {
    const val = GeneratedAttribute.parse("born:date").default();
    expect(typeof val).toBe("string");
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("test_default_value_is_string", () => {
    assertFieldDefaultValue("string", "MyString");
  });

  it("test_default_value_for_type", () => {
    const att = GeneratedAttribute.parse("type:string");
    expect(att.default()).toBe("");
  });

  it("test_default_value_is_text", () => {
    assertFieldDefaultValue("text", "MyText");
  });

  it("test_default_value_is_boolean", () => {
    assertFieldDefaultValue("boolean", false);
  });

  it("test_default_value_is_nil", () => {
    for (const attributeType of [
      "references",
      "belongs_to",
      "rich_text",
      "attachment",
      "attachments",
    ]) {
      assertFieldDefaultValue(attributeType, null);
    }
  });

  it("test_default_value_is_empty_string", () => {
    for (const attributeType of ["digest", "token"]) {
      assertFieldDefaultValue(attributeType, "");
    }
  });

  it("test_handles_index_names_for_references", () => {
    const p = GeneratedAttribute.parse("post:references");
    expect([p.indexName(), p.columnName()]).toEqual(["post_id", "post_id"]);
    expect(GeneratedAttribute.parse("post:references{polymorphic}").indexName()).toEqual([
      "post_id",
      "post_type",
    ]);
    expect(GeneratedAttribute.parse("title:string").columnName()).toBe("title");
    expect(GeneratedAttribute.parse("title:string").toString()).toBe("title:string");
    expect(GeneratedAttribute.parse("title:string:index").toString()).toBe("title:string:index");
    expect(GeneratedAttribute.parse("title:string:uniq").toString()).toBe("title:string:uniq");
  });
});
