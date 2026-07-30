import { describe, it, expect as vitestExpect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  Table,
  type SchemaStatementsLike,
} from "../connection-adapters/abstract/schema-definitions.js";
import { Table as PgTable } from "../connection-adapters/postgresql/schema-definitions.js";
import { describeIfPg } from "../support/describe-if-pg.js";

type Call = { method: string; args: unknown[] };
type ExpectFn = (method: string, returns: unknown, args: unknown[]) => void;

function isPlainEmptyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function normalizeArgs(args: unknown[]): unknown[] {
  const out = [...args];
  while (out.length > 0 && isPlainEmptyObject(out[out.length - 1])) out.pop();
  return out.map((a) => (a === undefined ? null : a));
}

interface MockConnection {
  base: SchemaStatementsLike;
  expect: ExpectFn;
  verify(): void;
}

function mockConnection(): MockConnection {
  const expectations: Call[] = [];
  const returns: unknown[] = [];
  const calls: Call[] = [];

  const base = new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          calls.push({ method: prop, args: normalizeArgs(args) });
          return Promise.resolve(returns[calls.length - 1] ?? null);
        };
      },
    },
  ) as SchemaStatementsLike;

  return {
    base,
    expect(method, ret, args) {
      expectations.push({ method, args: normalizeArgs(args) });
      returns.push(ret);
    },
    verify() {
      vitestExpect(calls).toEqual(expectations);
    },
  };
}

async function withChangeTable(
  body: (t: Table, expect: ExpectFn) => Promise<void> | void,
): Promise<void> {
  const mock = mockConnection();
  await body(new Table("delete_me", mock.base), mock.expect);
  mock.verify();
}

async function withPgChangeTable(
  body: (t: PgTable, expect: ExpectFn) => Promise<void> | void,
): Promise<void> {
  const mock = mockConnection();
  await body(new PgTable("delete_me", mock.base), mock.expect);
  mock.verify();
}

describe("Migration", () => {
  describe("TableTest", () => {
    it("references column type adds id", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addReference", null, ["delete_me", "customer"]);
        await t.references("customer");
      });
    });

    it("remove references column type removes id", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeReference", null, ["delete_me", "customer"]);
        await t.removeReferences("customer");
      });
    });

    it("add belongs to works like add references", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addReference", null, ["delete_me", "customer"]);
        await t.belongsTo("customer");
      });
    });

    it("remove belongs to works like remove references", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeReference", null, ["delete_me", "customer"]);
        await t.removeBelongsTo("customer");
      });
    });

    it("references column type with polymorphic adds type", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addReference", null, ["delete_me", "taggable", { polymorphic: true }]);
        await t.references("taggable", { polymorphic: true });
      });
    });

    it("remove references column type with polymorphic removes type", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeReference", null, ["delete_me", "taggable", { polymorphic: true }]);
        await t.removeReferences("taggable", { polymorphic: true });
      });
    });

    it("references column type with polymorphic and options null is false adds table flag", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addReference", null, ["delete_me", "taggable", { polymorphic: true, null: false }]);
        await t.references("taggable", { polymorphic: true, null: false });
      });
    });

    it("remove references column type with polymorphic and options null is false removes table flag", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeReference", null, [
          "delete_me",
          "taggable",
          { polymorphic: true, null: false },
        ]);
        await t.removeReferences("taggable", { polymorphic: true, null: false });
      });
    });

    it("references column type with polymorphic and type", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addReference", null, [
          "delete_me",
          "taggable",
          { polymorphic: true, type: "string" },
        ]);
        await t.references("taggable", { polymorphic: true, type: "string" });
      });
    });

    it("remove references column type with polymorphic and type", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeReference", null, [
          "delete_me",
          "taggable",
          { polymorphic: true, type: "string" },
        ]);
        await t.removeReferences("taggable", { polymorphic: true, type: "string" });
      });
    });

    it("timestamps creates updated at and created at", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addTimestamps", null, ["delete_me", { null: true }]);
        await t.timestamps({ null: true });
      });
    });

    it("remove timestamps creates updated at and created at", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeTimestamps", null, ["delete_me", { null: true }]);
        await t.removeTimestamps({ null: true });
      });
    });

    it("primary key creates primary key column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, [
          "delete_me",
          "id",
          "primary_key",
          { primaryKey: true, first: true },
        ]);
        await t.primaryKey("id", "primary_key", { first: true } as never);
      });
    });

    it("integer creates integer column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "foo", "integer"]);
        expect("addColumn", null, ["delete_me", "bar", "integer"]);
        await t.integer("foo", "bar");
      });
    });

    it("bigint creates bigint column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "foo", "bigint"]);
        expect("addColumn", null, ["delete_me", "bar", "bigint"]);
        await t.bigint("foo", "bar");
      });
    });

    it("string creates string column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "foo", "string"]);
        expect("addColumn", null, ["delete_me", "bar", "string"]);
        await t.string("foo", "bar");
      });
    });

    it("column creates column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "bar", "integer"]);
        await t.column("bar", "integer");
      });
    });

    it("column creates column with options", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "bar", "integer", { null: false }]);
        await t.column("bar", "integer", { null: false });
      });
    });

    it("column creates column with index", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "bar", "integer"]);
        expect("addIndex", null, ["delete_me", "bar"]);
        await t.column("bar", "integer", { index: true });
      });
    });

    it("index creates index", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addIndex", null, ["delete_me", "bar"]);
        await t.index("bar");
      });
    });

    it("index creates index with options", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addIndex", null, ["delete_me", "bar", { unique: true }]);
        await t.index("bar", { unique: true });
      });
    });

    it("index exists", async () => {
      await withChangeTable(async (t, expect) => {
        expect("indexExists", null, ["delete_me", "bar"]);
        await t.isIndexExists("bar");
      });
    });

    it("index exists with options", async () => {
      await withChangeTable(async (t, expect) => {
        expect("indexExists", null, ["delete_me", "bar", { unique: true }]);
        await t.isIndexExists("bar", { unique: true });
      });
    });

    it("rename index renames index", async () => {
      await withChangeTable(async (t, expect) => {
        expect("renameIndex", null, ["delete_me", "bar", "baz"]);
        await t.renameIndex("bar", "baz");
      });
    });

    it("change changes column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("changeColumn", null, ["delete_me", "bar", "string"]);
        await t.change("bar", "string");
      });
    });

    it("change changes column with options", async () => {
      await withChangeTable(async (t, expect) => {
        expect("changeColumn", null, ["delete_me", "bar", "string", { null: true }]);
        await t.change("bar", "string", { null: true });
      });
    });

    it("change default changes column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("changeColumnDefault", null, ["delete_me", "bar", "string"]);
        await t.changeDefault("bar", "string");
      });
    });

    it("change null changes column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("changeColumnNull", null, ["delete_me", "bar", true, null]);
        await t.changeNull("bar", true);
      });
    });

    it("remove drops single column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeColumns", null, ["delete_me", "bar"]);
        await t.remove("bar");
      });
    });

    it("remove drops multiple columns", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeColumns", null, ["delete_me", "bar", "baz"]);
        await t.remove("bar", "baz");
      });
    });

    it("remove drops multiple columns when column options are given", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeColumns", null, ["delete_me", "bar", "baz", { type: "string", null: false }]);
        await t.remove("bar", "baz", { type: "string", null: false });
      });
    });

    it("remove index removes index with options", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeIndex", null, ["delete_me", "bar", { unique: true }]);
        await t.removeIndex("bar", { unique: true } as never);
      });
    });

    it("rename renames column", async () => {
      await withChangeTable(async (t, expect) => {
        expect("renameColumn", null, ["delete_me", "bar", "baz"]);
        await t.rename("bar", "baz");
      });
    });

    it("table name set", async () => {
      await withChangeTable((t) => {
        vitestExpect(t.name).toEqual("delete_me");
      });
    });

    it("check constraint creates check constraint", async () => {
      await withChangeTable(async (t, expect) => {
        expect("addCheckConstraint", null, [
          "delete_me",
          "price > discounted_price",
          { name: "price_check" },
        ]);
        await t.checkConstraint("price > discounted_price", { name: "price_check" });
      });
    });

    it("check constraint exists", async () => {
      await withChangeTable(async (t, expect) => {
        expect("isCheckConstraintExists", null, ["delete_me", { name: "price_check" }]);
        vitestExpect(await t.isCheckConstraintExists({ name: "price_check" })).toBeFalsy();
      });
    });

    it("remove check constraint removes check constraint", async () => {
      await withChangeTable(async (t, expect) => {
        expect("removeCheckConstraint", null, ["delete_me", { name: "price_check" }]);
        await t.removeCheckConstraint({ name: "price_check" });
      });
    });

    it("remove column with if exists raises error", async () => {
      await vitestExpect(
        withChangeTable(async (t) => {
          await t.remove("name", { ifExists: true });
        }),
      ).rejects.toThrow(ArgumentError);
    });

    it("add column with if not exists raises error", async () => {
      await vitestExpect(
        withChangeTable(async (t) => {
          await t.string("nickname", { ifNotExists: true });
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  describeIfPg("TableTest", () => {
    it("json creates json column", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "foo", "json"]);
        expect("addColumn", null, ["delete_me", "bar", "json"]);
        await t.json("foo", "bar");
      });
    });

    it("xml creates xml column", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("addColumn", null, ["delete_me", "foo", "xml"]);
        expect("addColumn", null, ["delete_me", "bar", "xml"]);
        await t.xml("foo", "bar");
      });
    });

    it("exclusion constraint creates exclusion constraint", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("addExclusionConstraint", null, [
          "delete_me",
          "daterange(start_date, end_date) WITH &&",
          {
            using: "gist",
            where: "start_date IS NOT NULL AND end_date IS NOT NULL",
            name: "date_overlap",
          },
        ]);
        await t.exclusionConstraint("daterange(start_date, end_date) WITH &&", {
          using: "gist",
          where: "start_date IS NOT NULL AND end_date IS NOT NULL",
          name: "date_overlap",
        });
      });
    });

    it("remove exclusion constraint removes exclusion constraint", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("removeExclusionConstraint", null, ["delete_me", { name: "date_overlap" }]);
        await t.removeExclusionConstraint({ name: "date_overlap" });
      });
    });

    it("unique constraint creates unique constraint", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("addUniqueConstraint", null, [
          "delete_me",
          "foo",
          { deferrable: "deferred", name: "unique_constraint" },
        ]);
        await t.uniqueConstraint("foo", { deferrable: "deferred", name: "unique_constraint" });
      });
    });

    it("remove unique constraint removes unique constraint", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("removeUniqueConstraint", null, ["delete_me", { name: "unique_constraint" }]);
        await t.removeUniqueConstraint({ name: "unique_constraint" });
      });
    });

    it("validate check constraint", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("addCheckConstraint", null, [
          "delete_me",
          "price > discounted_price",
          { name: "price_check", validate: false },
        ]);
        await t.checkConstraint("price > discounted_price", {
          name: "price_check",
          validate: false,
        });
        expect("validateCheckConstraint", null, ["delete_me", "price_check"]);
        await t.validateCheckConstraint("price_check");
      });
    });

    it("validate constraint", async () => {
      await withPgChangeTable(async (t, expect) => {
        expect("addCheckConstraint", null, [
          "delete_me",
          "price > discounted_price",
          { name: "price_check", validate: false },
        ]);
        await t.checkConstraint("price > discounted_price", {
          name: "price_check",
          validate: false,
        });
        expect("validateConstraint", null, ["delete_me", "price_check"]);
        await t.validateConstraint("price_check");
      });
    });
  });
});
