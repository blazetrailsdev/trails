import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { AssociationScope } from "./association-scope.js";
import { AliasTracker } from "./alias-tracker.js";
import { RuntimeReflection } from "../reflection.js";
import { fixtures } from "../test-fixtures.js";

describe("AssociationScope — AliasTracker aliases repeated tables", () => {
  fixtures([]);

  class AtComment extends Base {
    static {
      this._tableName = "comments";

      this.hasMany("children", {
        className: "AtComment",
        foreignKey: "parent_id",
      });
      this.hasMany("grandchildren", {
        className: "AtComment",
        through: "children",
        source: "children",
      });
    }
  }

  beforeAll(() => {
    registerModel("AtComment", AtComment);
  });

  it("AliasTracker: bare table on first visit, aliased on repeat, thunk only invoked on repeat", () => {
    const tracker = AliasTracker.create(null, "unrelated", []);
    let thunkInvocations = 0;
    const candidate = () => {
      thunkInvocations++;
      return "comments_alias";
    };
    const t1 = tracker.aliasedTableFor(AtComment.arelTable, null, candidate);
    expect(t1.name).toBe("comments");
    expect(thunkInvocations).toBe(0);

    const t2 = tracker.aliasedTableFor(AtComment.arelTable, null, candidate);
    expect(t2.name).not.toBe("comments");
    expect(thunkInvocations).toBe(1);
  });

  it("AssociationScope aliases the repeat at_users visit in the emitted chain", () => {
    const refl = (AtComment as any)._reflectOnAssociation("grandchildren");
    const chain = refl.chain;
    expect(chain.length).toBeGreaterThan(1);

    class TestScope extends AssociationScope {
      public runGetChain(reflection: any, association: any) {
        const tracker = AliasTracker.create(null, reflection.klass.arelTable.name, []);
        return this.getChain(reflection, association, tracker);
      }
    }
    const builtChain = new TestScope(() => null).runGetChain(refl, {
      owner: new AtComment(),
      reflection: refl,
      klass: refl.klass,
    });
    expect(builtChain.length).toBe(chain.length);
    expect(builtChain[0]).toBeInstanceOf(RuntimeReflection);
    expect((builtChain[0] as any).klass).toBe(refl.klass);
    const tailAliased = (builtChain[1] as any).aliasedTable;
    const aliasedName: string =
      typeof tailAliased === "string" ? tailAliased : (tailAliased?.name ?? "");
    expect(aliasedName).not.toBe("comments");
    expect(aliasedName).toBe("children_grandchildren");
  });

  it("emits the repeat at_users visit as a real table aliased in the JOIN, not a bare alias", () => {
    const refl = (AtComment as any)._reflectOnAssociation("grandchildren");
    const owner = new AtComment({ parent_id: 3 });
    (owner as any).id = 3;
    const sql = (
      AssociationScope.scope({ owner, reflection: refl, klass: refl.klass }) as any
    ).toSql();
    expect(sql).toMatch(/INNER JOIN\s+["`]comments["`]\s+["`]children_grandchildren["`]/i);
    expect(sql).toMatch(/["`]children_grandchildren["`]\.["`]parent_id["`]/);
  });
});
