import { describe, it, expect, vi } from "vitest";
import { Base } from "../base.js";

// Rails seats `@primary_key` once, at `init_internals` (core.rb:846), and every
// instance-side reader reads that ivar (primary_key.rb:18-56) — so the record
// keeps the key its class answered at construction, whatever the class says
// later.
describe("per-instance @primary_key slot", () => {
  it("seats the record's primary key from the class at init_internals", () => {
    class SeatedToy extends Base {
      static override tableName = "toys";
      static _primaryKey = "toy_id";
    }

    const record = new SeatedToy();

    expect((record as unknown as { _primaryKey?: string })._primaryKey).toBe("toy_id");

    SeatedToy._primaryKey = "id";
    const spy = vi.spyOn(
      record as unknown as { _readAttribute(n: string): unknown },
      "_readAttribute",
    );
    void record.id;

    expect(spy).toHaveBeenCalledWith("toy_id");
  });

  it("keeps the seat the class answered at construction", () => {
    class ColdToy extends Base {
      static override tableName = "toys";
    }

    const record = new ColdToy();

    expect((record as unknown as { _primaryKey?: string })._primaryKey).toBe("id");

    (ColdToy as unknown as { adapter: unknown }).adapter = {
      internalSchemaCache: { getCachedPrimaryKeys: () => "toy_id" },
    };
    const spy = vi.spyOn(
      record as unknown as { _readAttribute(n: string): unknown },
      "_readAttribute",
    );
    void record.id;

    expect(spy).toHaveBeenCalledWith("id");

    const warm = new ColdToy();
    expect((warm as unknown as { _primaryKey?: string })._primaryKey).toBe("toy_id");
  });
});
