import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, registerSubclass } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { JoinDependency } from "./join-dependency.js";
import type { JoinPart } from "./join-dependency/join-part.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { Nodes, Table } from "@blazetrails/arel";
import "../test-helpers/models/company.js";

function nodeAt(jd: JoinDependency, path: string): JoinPart {
  return jd.nodes.find((n) => n.assocName === path)!;
}

function joinFor(joins: Nodes.Join[], node: JoinPart): Nodes.Join {
  return joins.find((join) => {
    const rel = join.left as Table | Nodes.TableAlias;
    return String(rel.tableAlias ?? rel.name) === node.effectiveSqlName;
  })!;
}

describe("JoinDependency Arel node construction", () => {
  fixtures({});

  class Owner extends Base {
    static {
      this._primaryKey = "owner_id";
      this.attribute("owner_id", "integer");
      this.attribute("name", "string");
    }
  }
  class Asset extends Base {
    static {
      this.attribute("owner_id", "integer");
      this.attribute("owner_type", "string");
    }
  }

  beforeEach(() => {
    (Owner as any)._reflections = {};
    (Asset as any)._reflections = {};
    registerModel(Owner);
    registerModel(Asset);
  });

  it("emits OuterJoin with polymorphic :as type predicate as Nodes.And", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", as: "owner" });

    const jd = new JoinDependency(Owner, null, "assets", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "assets");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = joinFor(joins, node) as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    expect(on).toBeInstanceOf(Nodes.On);

    const and = on.expr as Nodes.And;
    expect(and).toBeInstanceOf(Nodes.And);
    expect(and.children).toHaveLength(2);

    const typeEq = and.children[0] as Nodes.Equality;
    expect(typeEq).toBeInstanceOf(Nodes.Equality);
    expect((typeEq.left as any).name).toBe("owner_type");
    const typeVal = typeEq.right as any;
    const resolvedType = typeVal?.value?._valueBeforeTypeCast ?? typeVal?.value ?? typeVal?.val;
    expect(resolvedType).toBe("Owner");

    const eq = and.children[1] as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");
  });

  it("emits polymorphic :as type predicate using base class polymorphic_name for STI subclass owner", () => {
    class StiOwner extends Base {
      static {
        this.attribute("type", "string");
        this.attribute("name", "string");
      }
    }
    class StiSubOwner extends StiOwner {}
    StiOwner.inheritanceColumn = "type";
    registerSubclass(StiSubOwner);
    (StiOwner as any)._reflections = {};
    (StiSubOwner as any)._reflections = {};
    registerModel(StiOwner);
    registerModel(StiSubOwner);

    Associations.hasMany.call(StiSubOwner, "assets", { className: "Asset", as: "owner" });

    const jd = new JoinDependency(StiSubOwner, null, "assets", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "assets");
    expect(node).not.toBeNull();

    const outerJoin = joinFor(joins, node) as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const and = on.expr as Nodes.And;
    expect(and).toBeInstanceOf(Nodes.And);

    const typeEq = and.children[0] as Nodes.Equality;
    expect((typeEq.left as any).name).toBe("owner_type");
    const typeVal = typeEq.right as any;
    const resolvedType = typeVal?.value?._valueBeforeTypeCast ?? typeVal?.value ?? typeVal?.val;
    expect(resolvedType).toBe("StiOwner");
  });

  it("emits OuterJoin with STI subclass IN-list predicate", () => {
    class ClientOwner extends Base {
      static {
        this._tableName = "owners";
        this._primaryKey = "owner_id";
        this.hasMany("clients", { className: "Client", foreignKey: "owner_id" });
      }
    }
    registerModel(ClientOwner);

    const jd = new JoinDependency(ClientOwner, null, "clients", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "clients");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = joinFor(joins, node) as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const and = on.expr as Nodes.And;
    expect(and).toBeInstanceOf(Nodes.And);
    expect(and.children).toHaveLength(2);

    const eq = and.children[0] as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");

    const inNode = and.children[1] as Nodes.HomogeneousIn;
    expect(inNode).toBeInstanceOf(Nodes.HomogeneousIn);
    expect((inNode.left as any).name).toBe("type");

    expect((inNode.left as any).relation).toBe((eq.left as any).relation);
  });

  it("emits simple OuterJoin for hasMany without polymorphic/STI", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner, null, "assets", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "assets");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = joinFor(joins, node) as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const eq = on.expr as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");
    expect((eq.left as any).relation.name).toBe("assets");
    expect((eq.right as any).name).toBe("owner_id");
    expect((eq.right as any).relation.name).toBe("owners");
  });

  it("emits OuterJoin for belongsTo with correct key direction", () => {
    Associations.belongsTo.call(Asset, "owner", { className: "Owner", foreignKey: "owner_id" });

    const jd = new JoinDependency(Asset, null, "owner", Nodes.OuterJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "owner");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = joinFor(joins, node) as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const eq = on.expr as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");
    expect((eq.left as any).relation.name).toBe("owners");
    expect((eq.right as any).name).toBe("owner_id");
    expect((eq.right as any).relation.name).toBe("assets");
  });

  it("builds joinRoot tree with children for each association", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner, null, "assets", Nodes.OuterJoin);
    jd.joinConstraints([]);

    expect(jd.joinRoot.baseKlass).toBe(Owner);
    expect(jd.joinRoot.children).toHaveLength(1);
    expect(jd.joinRoot.children[0].tableIndex).toBeGreaterThanOrEqual(0);
    expect(jd.joinRoot.children[0].immediateAssocName).toBe("assets");
    expect(jd.joinRoot.children[0].baseKlass).toBe(Asset);
  });

  it("builds nested tree for nested association paths", () => {
    class Comment extends Base {
      static {
        this.attribute("asset_id", "integer");
        this.attribute("body", "string");
      }
    }
    (Comment as any)._reflections = {};
    registerModel(Comment);

    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });
    Associations.hasMany.call(Asset, "comments", { className: "Comment", foreignKey: "asset_id" });

    const jd = new JoinDependency(Owner, null, "assets.comments", Nodes.OuterJoin);
    jd.joinConstraints([]);

    expect(jd.joinRoot.children).toHaveLength(1);
    const assetsNode = jd.joinRoot.children[0];
    expect(assetsNode.immediateAssocName).toBe("assets");
    expect(assetsNode.children).toHaveLength(1);
    const commentsNode = assetsNode.children[0];
    expect(commentsNode.immediateAssocName).toBe("comments");
    expect(commentsNode.baseKlass).toBe(Comment);
  });

  it("uses table alias when name collides", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });
    Associations.belongsTo.call(Asset, "owner", { className: "Owner", foreignKey: "owner_id" });

    const jd = new JoinDependency(Asset, null, { owner: "assets" }, Nodes.OuterJoin);
    const node1 = nodeAt(jd, "owner");
    expect(node1.effectiveSqlName).toBe("owners");

    const node2 = nodeAt(jd, "owner.assets");

    const joins = jd.joinConstraints([]);

    const table1 = (joinFor(joins, node1) as Nodes.OuterJoin).left;
    expect((table1 as any).tableAlias).toBeNull();
    expect(node2.effectiveSqlName).toBe("assets_owners");
    const table2 = (joinFor(joins, node2) as Nodes.OuterJoin).left;
    expect((table2 as any).tableAlias).toBe("assets_owners");
  });

  it("respects joinType constructor arg (InnerJoin)", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner, null, "assets", Nodes.InnerJoin);
    const joins = jd.joinConstraints([]);
    const node = nodeAt(jd, "assets");
    expect(node).not.toBeNull();
    expect(joinFor(joins, node)).toBeInstanceOf(Nodes.InnerJoin);
  });

  it("pushes JoinAssociation into tree when reflection is available", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner, null, "assets", Nodes.OuterJoin);
    jd.joinConstraints([]);

    const child = jd.joinRoot.children[0];
    expect(child).toBeInstanceOf(JoinAssociation);
    expect((child as JoinAssociation).reflection).toBeDefined();
    expect(child.tableIndex).toBeGreaterThanOrEqual(0);
    expect(child.immediateAssocName).toBe("assets");
  });
});
