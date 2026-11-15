import { describe, it, expect } from "vitest";
import { displacedIncludedMembers, include } from "@blazetrails/ruby-compat";
import { Base } from "../lib/index.js";
import { attributeInDatabase } from "../lib/attribute-methods.js";

describe("class-body members displacing include()d ports", () => {
  it("Base displaces no included member it does not list under shadowsIncluded", () => {
    expect(displacedIncludedMembers(Base)).toEqual(new Map());
  });

  it("reports a class-body attributeInDatabase that displaces the mixed-in port", () => {
    const port = { attributeInDatabase };
    class Record {
      attributeInDatabase(_attrName: string): unknown {
        return "attribute_was";
      }
    }
    include(Record, port);
    expect(displacedIncludedMembers(Record).get("attributeInDatabase")).toEqual([port]);
  });
});
