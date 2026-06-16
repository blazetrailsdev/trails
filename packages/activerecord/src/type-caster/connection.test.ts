import { describe, it, expect, beforeAll } from "vitest";
import { StringType } from "@blazetrails/activemodel";
import { Connection } from "./connection.js";
import { AttributedDeveloper, DeveloperName } from "../test-helpers/models/developer.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";

describe("ConnectionTest", () => {
  useHandlerFixtures(["developers"], { schema: TEST_SCHEMA });

  beforeAll(async () => {
    await AttributedDeveloper.loadSchema();
  });

  it("#type_for_attribute is not aware of custom types", () => {
    const typeCaster = new Connection(AttributedDeveloper, "developers");

    const type = typeCaster.typeForAttribute("name");

    expect(type).not.toBeInstanceOf(DeveloperName);
    expect(type.constructor).toBe(StringType);
  });
});
