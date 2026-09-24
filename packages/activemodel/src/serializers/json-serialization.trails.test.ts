/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Each model below spells `include ActiveModel::Serializers::JSON` in its class body, the way the
   Rails test model it mirrors does; the empty class/interface merge beside it is how
   `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { JSON as SerializersJSON } from "./json.js";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";

describe("JsonSerializationTest", () => {
  it("from_json unwraps via first-value semantics on multi-key wrappers (Rails hash.values.first)", () => {
    class Multi extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      declare static includeRootInJson: boolean | string;

      static {
        include(this, Attributes);
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = "person";
      }
    }
    interface Multi extends Attributes, SerializersJSON {}

    try {
      const m = new Multi({}).fromJson('{"first":{"name":"Carol"},"person":{"name":"Dan"}}');
      expect(m._readAttribute("name")).toBe("Carol");
    } finally {
      Multi.includeRootInJson = false;
    }
  });

  it("from_json rejects non-object JSON with shape-accurate diagnostics", () => {
    class P extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      declare static includeRootInJson: boolean | string;

      static {
        include(this, Attributes);
        include(this, SerializersJSON);
        this.attribute("name", "string");
      }
    }
    interface P extends Attributes, SerializersJSON {}

    expect(() => new P({}).fromJson("42")).toThrow(/Integer passed/);
    expect(() => new P({}).fromJson("[1,2]")).toThrow(/Array passed/);
    expect(() => new P({}).fromJson("null")).toThrow(/NilClass passed/);
  });

  it("from_json rejects non-object root payload after unwrap", () => {
    class P extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      declare static includeRootInJson: boolean | string;

      static {
        include(this, Attributes);
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = true;
      }
    }
    interface P extends Attributes, SerializersJSON {}

    try {
      expect(() => new P({}).fromJson('{"p":42}')).toThrow(/Integer passed/);
    } finally {
      P.includeRootInJson = false;
    }
  });

  it("from_json defaults includeRoot to includeRootInJson when no second arg passed", () => {
    class Wrapped extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      declare static includeRootInJson: boolean | string;

      static {
        include(this, Attributes);
        include(this, SerializersJSON);
        this.attribute("name", "string");
        this.includeRootInJson = true;
      }
    }
    interface Wrapped extends Attributes, SerializersJSON {}

    try {
      const w = new Wrapped({}).fromJson('{"wrapped":{"name":"Alice"}}');
      expect(w._readAttribute("name")).toBe("Alice");
    } finally {
      Wrapped.includeRootInJson = false;
    }
  });
});
