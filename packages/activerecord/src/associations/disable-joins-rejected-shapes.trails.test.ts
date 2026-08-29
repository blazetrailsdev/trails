import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "../index.js";
import type { TableDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import { association } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import {
  HasManyThroughAssociationPolymorphicSourceError,
  HasManyThroughAssociationPointlessSourceTypeError,
} from "./errors.js";

describe("disable_joins shapes the deleted routing gate rejected", () => {
  fixtures([]);

  class RjMember extends Base {
    static {
      this._tableName = "rj_members";
      this.attribute("name", "string");
    }
  }
  class RjComment extends Base {
    static {
      this._tableName = "rj_comments";
      this.attribute("rj_author_id", "integer");
      this.attribute("origin_id", "integer");
      this.attribute("origin_type", "string");
      this.belongsTo("origin", {
        className: "RjMember",
        foreignKey: "origin_id",
        polymorphic: true,
      });
      this.belongsTo("rjMember", { className: "RjMember", foreignKey: "origin_id" });
    }
  }
  class RjAuthor extends Base {
    static {
      this._tableName = "rj_authors";
      this.attribute("name", "string");
      this.hasMany("rjComments", { className: "RjComment", foreignKey: "rj_author_id" });
      this.hasMany("polySourceNoTypeRjMembers", {
        className: "RjMember",
        through: "rjComments",
        source: "origin",
        disableJoins: true,
      });
      this.hasMany("pointlessSourceTypeRjMembers", {
        className: "RjMember",
        through: "rjComments",
        source: "rjMember",
        sourceType: "RjMember",
        disableJoins: true,
      });
    }
  }

  beforeAll(async () => {
    await Base.connection.createTable("rj_authors", { force: true }, (t: TableDefinition) => {
      t.string("name");
    });
    await Base.connection.createTable("rj_comments", { force: true }, (t: TableDefinition) => {
      t.integer("rj_author_id");
      t.integer("origin_id");
      t.string("origin_type");
    });
    await Base.connection.createTable("rj_members", { force: true }, (t: TableDefinition) => {
      t.string("name");
    });
    registerModel("RjAuthor", RjAuthor);
    registerModel("RjComment", RjComment);
    registerModel("RjMember", RjMember);
  });

  afterAll(async () => {
    await Base.connection.dropTable("rj_members", "rj_comments", "rj_authors", { ifExists: true });
  });

  it("a polymorphic source without source_type raises rather than routing anywhere", async () => {
    const author = await RjAuthor.create({ name: "a" });
    expect(() => association(author, "polySourceNoTypeRjMembers")).toThrow(
      HasManyThroughAssociationPolymorphicSourceError,
    );
  });

  it("a source_type on a non-polymorphic source raises rather than routing anywhere", async () => {
    const author = await RjAuthor.create({ name: "a" });
    expect(() => association(author, "pointlessSourceTypeRjMembers")).toThrow(
      HasManyThroughAssociationPointlessSourceTypeError,
    );
  });

  it("a disable_joins association with no through reflection is refused by the macro", () => {
    expect(() => {
      class RjNoThrough extends Base {
        static {
          this._tableName = "rj_authors";
          this.hasMany("rjComments", {
            className: "RjComment",
            foreignKey: "rj_author_id",
            disableJoins: true,
          });
        }
      }
      void RjNoThrough;
    }).toThrow(/disableJoins/);
  });
});
