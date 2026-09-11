import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";

import { StringKeyedHashAccessor } from "../../../store.js";
import { Hstore } from "./hstore.js";

describe("PostgreSQL::OID::Hstore", () => {
  it("accessor returns StringKeyedHashAccessor", () => {
    expect(new Hstore().accessor()).toBe(StringKeyedHashAccessor);
  });

  it("deserialize raises ArgumentError on a malformed document", () => {
    expect(() => new Hstore().deserialize('"a"=>"b" junk')).toThrow(
      new ArgumentError('Invalid Hstore document: "\\"a\\"=>\\"b\\" junk"'),
    );
    expect(() => new Hstore().deserialize(" ")).toThrow(ArgumentError);
  });

  it("deserialize unescapes keys and values and reads NULL", () => {
    expect(new Hstore().deserialize('"a\\"b"=>"c\\\\d", "e"=>NULL')).toEqual({
      'a"b': "c\\d",
      e: null,
    });
    expect(new Hstore().deserialize("")).toEqual({});
  });
});
