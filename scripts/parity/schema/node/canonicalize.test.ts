import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonicalize.js";
import type { NativeDump } from "./canonicalize.js";

describe("canonicalize", () => {
  it("maps a trivial fixture to canonical form", () => {
    const native: NativeDump = {
      users: {
        columns: [
          {
            name: "id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "email",
            sqlType: "TEXT",
            primaryKey: false,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "name",
            sqlType: "TEXT",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "score",
            sqlType: "REAL",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "avatar",
            sqlType: "BLOB",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "created_at",
            sqlType: "DATETIME",
            primaryKey: false,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "active",
            sqlType: "INTEGER",
            primaryKey: false,
            null: false,
            default: "1",
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: ["id"],
      },
    };

    const result = canonicalize(native);

    expect(result.version).toBe(1);
    expect(result.tables).toHaveLength(1);
    const [table] = result.tables;
    expect(table!.name).toBe("users");
    expect(table!.primaryKey).toBe("id");
    expect(table!.columns.map((c) => c.name)).toEqual([
      "id",
      "email",
      "name",
      "score",
      "avatar",
      "created_at",
      "active",
    ]);
    expect(table!.columns.find((c) => c.name === "id")!.type).toBe("integer");
    expect(table!.columns.find((c) => c.name === "score")!.type).toBe("float");
    expect(table!.columns.find((c) => c.name === "avatar")!.type).toBe("binary");
    expect(table!.columns.find((c) => c.name === "created_at")!.type).toBe("datetime");
    expect(table!.columns.find((c) => c.name === "active")!.default).toBe(1);
    expect(table!.indexes).toHaveLength(0);
  });

  it("preserves column declaration order", () => {
    const native: NativeDump = {
      things: {
        columns: [
          {
            name: "z",
            sqlType: "TEXT",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "a",
            sqlType: "TEXT",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "m",
            sqlType: "TEXT",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.columns.map((c) => c.name)).toEqual(["z", "a", "m"]);
  });

  it("sorts tables by name", () => {
    const native: NativeDump = {
      zebra: {
        columns: [
          {
            name: "id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: ["id"],
      },
      apple: {
        columns: [
          {
            name: "id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: ["id"],
      },
    };
    const result = canonicalize(native);
    expect(result.tables.map((t) => t.name)).toEqual(["apple", "zebra"]);
  });

  it("filters schema_migrations and ar_internal_metadata", () => {
    const native: NativeDump = {
      users: {
        columns: [
          {
            name: "id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: ["id"],
      },
      schema_migrations: {
        columns: [
          {
            name: "version",
            sqlType: "TEXT",
            primaryKey: false,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
      ar_internal_metadata: {
        columns: [
          {
            name: "key",
            sqlType: "TEXT",
            primaryKey: false,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
    };
    const result = canonicalize(native);
    expect(result.tables.map((t) => t.name)).toEqual(["users"]);
  });

  it("filters sqlite_autoindex_* and sorts remaining indexes by name", () => {
    const native: NativeDump = {
      posts: {
        columns: [
          {
            name: "id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [
          { name: "sqlite_autoindex_posts_1", columns: ["title"], unique: true },
          { name: "idx_posts_z", columns: ["created_at"], unique: false },
          { name: "idx_posts_a", columns: ["author_id"], unique: false },
        ],
        primaryKeyColumns: ["id"],
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.indexes.map((i) => i.name)).toEqual(["idx_posts_a", "idx_posts_z"]);
  });

  it("represents composite PK as tuple", () => {
    const native: NativeDump = {
      taggings: {
        columns: [
          {
            name: "tag_id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "taggable_id",
            sqlType: "INTEGER",
            primaryKey: true,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: ["tag_id", "taggable_id"],
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.primaryKey).toEqual(["tag_id", "taggable_id"]);
  });

  it("uses primaryKeyColumns order, not column declaration order, for composite PK", () => {
    // Simulates PRIMARY KEY (b, a) where a appears first in the table definition.
    // Rails preserves the PK constraint order via PRAGMA table_info `pk` position.
    const native: NativeDump = {
      items: {
        columns: [
          {
            name: "a",
            sqlType: "INTEGER",
            primaryKey: true,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "b",
            sqlType: "INTEGER",
            primaryKey: true,
            null: false,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: ["b", "a"], // PK constraint order: b first, then a
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.primaryKey).toEqual(["b", "a"]);
  });

  it("represents no-PK table", () => {
    const native: NativeDump = {
      logs: {
        columns: [
          {
            name: "message",
            sqlType: "TEXT",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.primaryKey).toBeNull();
  });

  it("coerces numeric string defaults", () => {
    const native: NativeDump = {
      t: {
        columns: [
          {
            name: "count",
            sqlType: "INTEGER",
            primaryKey: false,
            null: false,
            default: "0",
            limit: null,
            precision: null,
            scale: null,
          },
          {
            name: "rate",
            sqlType: "REAL",
            primaryKey: false,
            null: false,
            default: "1.5",
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.columns[0]!.default).toBe(0);
    expect(table!.columns[1]!.default).toBe(1.5);
  });

  it("coerces quoted string defaults", () => {
    const native: NativeDump = {
      t: {
        columns: [
          {
            name: "status",
            sqlType: "TEXT",
            primaryKey: false,
            null: false,
            default: "'active'",
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
    };
    const [table] = canonicalize(native).tables;
    expect(table!.columns[0]!.default).toBe("active");
  });

  it("throws on unknown SQL type", () => {
    const native: NativeDump = {
      t: {
        columns: [
          {
            name: "x",
            sqlType: "UNKNOWNTYPE",
            primaryKey: false,
            null: true,
            default: null,
            limit: null,
            precision: null,
            scale: null,
          },
        ],
        indexes: [],
        primaryKeyColumns: [],
      },
    };
    expect(() => canonicalize(native)).toThrow(/unknown SQL type "UNKNOWNTYPE"/);
  });
});
