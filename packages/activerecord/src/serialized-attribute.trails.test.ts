import { describe, it, expect } from "vitest";
import { YAML } from "@blazetrails/ruby-compat/yaml";
import { buildColumnSerializer } from "./attribute-methods/serialization.js";
import { YAMLColumn } from "./coders/yaml-column.js";

describe("SerializedAttributeTest", () => {
  it("coder YAML builds a YAMLColumn, as coder YAMLColumn does", () => {
    const viaYaml = buildColumnSerializer("content", YAML, Object);
    const viaColumn = buildColumnSerializer("content", YAMLColumn, Object);

    expect(viaYaml).toBeInstanceOf(YAMLColumn);
    expect(viaColumn).toBeInstanceOf(YAMLColumn);
    expect((viaYaml as YAMLColumn).dump({ a: 1 })).toBe((viaColumn as YAMLColumn).dump({ a: 1 }));
  });
});
