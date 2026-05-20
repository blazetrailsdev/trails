import { describe, it, expect } from "vitest";
import { GeneratedAttribute, GeneratorError } from "./generated-attribute.js";

describe("GeneratedAttribute", () => {
  it("test_field_name_with_dangerous_attribute_raises_error", () => {
    expect(() => GeneratedAttribute.parse("save:string")).toThrow(GeneratorError);
  });

  it("test_field_type_returns_number_field", () => {
    const ft = (s: string) => GeneratedAttribute.parse(s).fieldType();
    expect(ft("age:integer")).toBe("number_field");
    expect(ft("body:text")).toBe("textarea");
    expect(ft("body:rich_text")).toBe("rich_textarea");
    expect(ft("avatar:attachment")).toBe("file_field");
    expect(ft("photos:attachments")).toBe("file_field");
    expect(ft("born:date")).toBe("date_field");
    expect(ft("at:datetime")).toBe("datetime_field");
    expect(ft("when:time")).toBe("time_field");
    expect(ft("admin:boolean")).toBe("checkbox");
    expect(ft("title:string")).toBe("text_field");
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
