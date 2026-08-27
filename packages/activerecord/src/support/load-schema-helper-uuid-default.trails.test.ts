import { expect, it } from "vitest";
import { describeIfPg, PG_TEST_URL } from "./describe-if-pg.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { loadAdapterSpecificSchema } from "./load-schema-helper.js";
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
                ): Promise<unknown>;
              };
              const td = await builder.buildCreateTableDefinition(
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

      await expect(
        loadAdapterSpecificSchema(probe as unknown as AbstractAdapter),
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
