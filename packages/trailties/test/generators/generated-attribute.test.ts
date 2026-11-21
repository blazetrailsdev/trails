import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertMatch, assertRaise } from "@blazetrails/activesupport/testing/assertions";
import { toFs } from "@blazetrails/activesupport/core-ext/date/conversions";
import { toFs as dateTimeToFs } from "@blazetrails/activesupport/core-ext/date-time/conversions";
import { DateTime } from "@blazetrails/date";
import { Base } from "@blazetrails/activerecord";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/trailties/active-record.js";
import { GeneratedAttribute } from "../../lib/generators/generated-attribute.js";
import { Error } from "../../lib/generators/base.js";
import {
  assertFieldDefaultValue,
  assertFieldType,
} from "../../lib/generators/testing/assertions.js";
import { createGeneratedAttribute } from "../../lib/generators/testing/behavior.js";

class GeneratedAttributeApp extends Application {}
let oldBelongsToRequiredByDefault: boolean | undefined;

beforeEach(async () => {
  Trails.application = GeneratedAttributeApp.instance();
  oldBelongsToRequiredByDefault = Trails.application.config.activeRecord.belongsToRequiredByDefault;
  Trails.application.config.activeRecord.belongsToRequiredByDefault = true;
  await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  await Base.leaseConnection();
});

afterEach(() => {
  Trails.application!.config.activeRecord.belongsToRequiredByDefault =
    oldBelongsToRequiredByDefault;
});

describe("GeneratedAttributeTest", () => {
  it("field name with dangerous attribute raises error", async () => {
    const e = await assertRaise([Error], {}, () => createGeneratedAttribute("string", "save"));
    const message = "Could not generate field 'save', as it is already defined by Active Record.";
    assertMatch(message, e.message);
  });

  it("field type returns number field", () => {
    assertFieldType("integer", "number_field");
  });

  it("field type returns text field", () => {
    for (const attributeType of ["float", "decimal", "string"]) {
      assertFieldType(attributeType, "text_field");
    }
  });

  it("field type returns datetime select", () => {
    for (const attributeType of ["datetime", "timestamp"]) {
      assertFieldType(attributeType, "datetime_field");
    }
  });

  it("field type returns time select", () => {
    assertFieldType("time", "time_field");
  });

  it("field type returns date select", () => {
    assertFieldType("date", "date_field");
  });

  it("field type returns textarea", () => {
    assertFieldType("text", "textarea");
  });

  it("field type returns checkbox", () => {
    assertFieldType("boolean", "checkbox");
  });

  it("field type returns rich textarea", () => {
    assertFieldType("rich_text", "rich_textarea");
  });

  it("field type returns file field", () => {
    for (const attributeType of ["attachment", "attachments"]) {
      assertFieldType(attributeType, "file_field");
    }
  });

  it("field type with unknown type raises error", async () => {
    const fieldType = "unknown";
    const e = await assertRaise([Error], {}, () => createGeneratedAttribute(fieldType));
    const message = "Could not generate field 'test' with unknown type 'unknown'";
    assertMatch(message, e.message);
  });

  it("field type with unknown index type raises error", async () => {
    const indexType = "unknown";
    const e = await assertRaise([Error], {}, () =>
      createGeneratedAttribute("string", "name", indexType),
    );
    const message = "Could not generate field 'name' with unknown index 'unknown'";
    assertMatch(message, e.message);
  });

  it("default value is integer", () => {
    assertFieldDefaultValue("integer", 1);
  });

  it("default value is float", () => {
    assertFieldDefaultValue("float", 1.5);
  });

  it("default value is decimal", () => {
    assertFieldDefaultValue("decimal", "9.99");
  });

  it("default value is datetime", () => {
    for (const attributeType of ["datetime", "timestamp", "time"]) {
      assertFieldDefaultValue(attributeType, dateTimeToFs(DateTime.now(), "db"));
    }
  });

  it("default value is date", () => {
    assertFieldDefaultValue("date", toFs(Temporal.Now.plainDateISO(), "db"));
  });

  it("default value is string", () => {
    assertFieldDefaultValue("string", "MyString");
  });

  it("default value for type", () => {
    const att = GeneratedAttribute.parse("type:string");
    expect(att.default()).toBe("");
  });

  it("default value is text", () => {
    assertFieldDefaultValue("text", "MyText");
  });

  it("default value is boolean", () => {
    assertFieldDefaultValue("boolean", false);
  });

  it("default value is nil", () => {
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

  it("default value is empty string", () => {
    for (const attributeType of ["digest", "token"]) {
      assertFieldDefaultValue(attributeType, "");
    }
  });

  it("human name", () => {
    expect(createGeneratedAttribute("string", "full_name").humanName()).toBe("Full name");
  });

  it("size option can be passed to string text and binary", () => {
    for (const attributeType of ["text", "binary"]) {
      const generatedAttribute = createGeneratedAttribute(`${attributeType}{medium}`);
      expect(generatedAttribute.attrOptions.size).toBe("medium");
    }
  });

  it("size option raises exception when passed to invalid type", async () => {
    for (const attributeType of ["integer", "string"]) {
      const e = await assertRaise([Error], {}, () =>
        createGeneratedAttribute(`${attributeType}{medium}`),
      );
      const message = `Could not generate field 'test' with unknown type '${attributeType}{medium}'`;
      assertMatch(message, e.message);
    }
  });

  it("limit option can be passed to string text integer and binary", () => {
    for (const attributeType of ["string", "text", "binary", "integer"]) {
      const generatedAttribute = createGeneratedAttribute(`${attributeType}{65535}`);
      expect(generatedAttribute.attrOptions.limit).toBe(65535);
    }
  });

  it("reference is true", () => {
    for (const attributeType of ["references", "belongs_to"]) {
      expect(createGeneratedAttribute(attributeType).reference()).toBeTruthy();
    }
  });

  it("reference is false", () => {
    for (const attributeType of ["string", "text", "float"]) {
      expect(createGeneratedAttribute(attributeType).reference()).toBeFalsy();
    }
  });

  it("polymorphic reference is true", () => {
    for (const attributeType of ["references", "belongs_to"]) {
      expect(createGeneratedAttribute(`${attributeType}{polymorphic}`).polymorphic()).toBeTruthy();
    }
  });

  it("polymorphic reference is false", () => {
    for (const attributeType of ["references", "belongs_to"]) {
      expect(createGeneratedAttribute(attributeType).polymorphic()).toBeFalsy();
    }
  });

  it("blank type defaults to string", () => {
    expect(createGeneratedAttribute(null as unknown as string, "title").type).toBe("string");
    expect(createGeneratedAttribute("", "title").type).toBe("string");
  });

  it("handles index names for references", () => {
    expect(createGeneratedAttribute("string", "post").indexName()).toBe("post");
    expect(createGeneratedAttribute("references", "post").indexName()).toBe("post_id");
    expect(createGeneratedAttribute("belongs_to", "post").indexName()).toBe("post_id");
    expect(createGeneratedAttribute("references{polymorphic}", "post").indexName()).toEqual([
      "post_id",
      "post_type",
    ]);
  });

  it("handles column names for references", () => {
    expect(createGeneratedAttribute("string", "post").columnName()).toBe("post");
    expect(createGeneratedAttribute("references", "post").columnName()).toBe("post_id");
    expect(createGeneratedAttribute("belongs_to", "post").columnName()).toBe("post_id");
  });

  it("parse works with adapter specific types", () => {
    const att = GeneratedAttribute.parse("document:json");
    expect(att.name).toBe("document");
    expect(att.type).toBe("json");
  });

  it("parse required attribute with index", () => {
    const att = GeneratedAttribute.parse("supplier:references:index");
    expect(att.name).toBe("supplier");
    expect(att.type).toBe("references");
    expect(att.hasIndex()).toBeTruthy();
    expect(att.isRequired()).toBeTruthy();
  });

  it("parse required attribute with index false when belongs to required by default global config is false", () => {
    Trails.application!.config.activeRecord.belongsToRequiredByDefault = false;
    const att = GeneratedAttribute.parse("supplier:references:index");
    expect(att.isRequired()).toBeFalsy();
  });

  it("generated attribute to s", () => {
    const att = GeneratedAttribute.parse("name");
    expect(att.toString()).toBe("name:string");
  });

  it("generated attribute to s with index", () => {
    const att = GeneratedAttribute.parse("name:index");
    expect(att.toString()).toBe("name:string:index");
  });

  it("generated attribute to s with uniq index", () => {
    const att = GeneratedAttribute.parse("name:uniq");
    expect(att.toString()).toBe("name:string:uniq");
  });

  it("generated attribute to s with limit", () => {
    const att = GeneratedAttribute.parse("name:text{140}");
    expect(att.toString()).toBe("name:text{140}");
  });

  it("generated attribute to s with size", () => {
    const att = GeneratedAttribute.parse("name:text{medium}");
    expect(att.toString()).toBe("name:text{medium}");
  });

  it("generated attribute to s with precision and scale", () => {
    const att = GeneratedAttribute.parse("name:decimal{1,2}");
    expect(att.toString()).toBe("name:decimal{1,2}");
  });

  it("generated attribute to s with polymorphic", () => {
    const att = GeneratedAttribute.parse("name:references{polymorphic}");
    expect(att.toString()).toBe("name:references{polymorphic}");
  });
});
