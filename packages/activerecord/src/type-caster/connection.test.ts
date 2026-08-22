import { describe, it, expect, beforeAll } from "vitest";
import { StringType } from "@blazetrails/activemodel";
import { Connection } from "./connection.js";
import { AttributedDeveloper, DeveloperName } from "../test-helpers/models/developer.js";
import { fixtures } from "../test-fixtures.js";

describe("ConnectionTest", () => {
  fixtures(["developers"]);

  beforeAll(async () => {
    await AttributedDeveloper.loadSchema();
  });

  it("#type_for_attribute is not aware of custom types", () => {
    const typeCaster = new Connection(AttributedDeveloper, "developers");

    const type = typeCaster.typeForAttribute("name");

    expect(type.constructor).not.toEqual(DeveloperName);
    expect(type.constructor).toEqual(StringType);
  });
});
