import { describe, it, expect, vi } from "vitest";
import { StringType } from "@blazetrails/activemodel";
import { Connection } from "./connection.js";
import { defaultValue } from "../type.js";

describe("ConnectionTest (trails)", () => {
  function klassWith(dataSourceExists: boolean | undefined) {
    const lookupCastTypeFromColumn = vi.fn(() => new StringType());
    const pool = {
      poolConfig: {
        schemaReflection: {
          loadedCache: {
            getCachedDataSourceExists: () => dataSourceExists,
            getCachedColumnsHash: () => ({ name: { name: "name" } }),
          },
        },
      },
      withConnectionSync: (block: (connection: unknown) => unknown) =>
        block({ lookupCastTypeFromColumn }),
    };
    return { klass: { connectionPool: () => pool }, lookupCastTypeFromColumn };
  }

  it("#type_for_attribute looks the column type up when the data source exists", () => {
    const { klass, lookupCastTypeFromColumn } = klassWith(true);

    const type = new Connection(klass, "developers").typeForAttribute("name");

    expect(type).toBeInstanceOf(StringType);
    expect(lookupCastTypeFromColumn).toHaveBeenCalledWith({ name: "name" });
  });

  it("#type_for_attribute answers the default type when the data source does not exist", () => {
    for (const dataSourceExists of [false, undefined]) {
      const { klass, lookupCastTypeFromColumn } = klassWith(dataSourceExists);

      const type = new Connection(klass, "developers").typeForAttribute("name");

      expect(type).toBe(defaultValue());
      expect(lookupCastTypeFromColumn).not.toHaveBeenCalled();
    }
  });

  it("#type_for_attribute answers the default type for an unknown column", () => {
    const { klass, lookupCastTypeFromColumn } = klassWith(true);

    const type = new Connection(klass, "developers").typeForAttribute("salary");

    expect(type).toBe(defaultValue());
    expect(lookupCastTypeFromColumn).not.toHaveBeenCalled();
  });
});
