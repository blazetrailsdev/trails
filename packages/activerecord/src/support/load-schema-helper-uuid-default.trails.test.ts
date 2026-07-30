/**
 * trails-only cover for the `else` half of `postgresql_specific_schema.rb:7`'s
 * `uuid_default = supports_pgcrypto_uuid? ? {} : { default: "uuid_generate_v4()" }`.
 *
 * The branch is dead on our matrix — `supportsPgcryptoUuid()` is PG >= 9.4 and
 * CI runs pg17, so the ternary always yields `{}` and the three `id: :uuid`
 * tables ride the adapter's implicit `gen_random_uuid()` PK default. Without
 * this file nothing would notice the fallback rotting, and a reader would have
 * no signal that it is deliberately unreachable rather than unused. Rails has
 * no such test: on Ruby the predicate is genuinely false on old servers.
 *
 * The predicate is stubbed false on a real adapter and `createTable` is
 * intercepted, so the DDL is emitted and asserted without laying anything on
 * the shared per-worker database.
 */
import { expect, it } from "vitest";
import { describeIfPg, PG_TEST_URL } from "./describe-if-pg.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { loadSchema } from "./load-schema-helper.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

class StopLoad extends Error {}

describeIfPg("load_schema_helper: uuid_default without pgcrypto", () => {
  it("defaults the uuid primary keys to uuid_generate_v4()", async () => {
    const adapter = new PostgreSQLAdapter(PG_TEST_URL);
    const emitted = new Map<string, string>();

    try {
      await adapter.getDatabaseVersion();

      const probe = new Proxy(adapter, {
        get(target, prop) {
          if (prop === "supportsPgcryptoUuid") return () => false;
          if (prop === "enableExtension") return async () => {};
          if (prop === "createTable") {
            return async (
              name: string,
              options: Record<string, unknown>,
              definer: (t: unknown) => void,
            ) => {
              if (name === "defaults") throw new StopLoad();
              const builder = target as unknown as {
                buildCreateTableDefinition(
                  name: string,
                  options: Record<string, unknown>,
                  definer: (t: unknown) => void,
                ): unknown;
              };
              const td = builder.buildCreateTableDefinition(
                name,
                { ...options, force: false },
                definer,
              );
              emitted.set(name, await target.schemaCreation.accept(td as never));
            };
          }
          return Reflect.get(target, prop, target);
        },
      });

      // The already-laid-canonical arm (the thunk overload), so only the
      // adapter-specific half of `load_schema` runs against the probe.
      await expect(
        loadSchema(async () => probe as unknown as AbstractAdapter),
      ).rejects.toBeInstanceOf(StopLoad);

      for (const name of ["chat_messages", "uuid_parents", "uuid_children"]) {
        expect(emitted.get(name)).toContain(
          `"id" uuid DEFAULT uuid_generate_v4() NOT NULL PRIMARY`,
        );
      }
    } finally {
      await adapter.close();
    }
  });
});
