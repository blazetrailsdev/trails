/**
 * Covers the Arel node construction in JoinDependency's direct-path
 * `addAssociation`. Verifies that the returned JoinNode carries an
 * `arelJoin` (Nodes.OuterJoin) with the correct ON predicate structure
 * for polymorphic :as, STI subclass IN-list, and basic foreign-key joins.
 *
 * Through-association Arel construction is covered by
 * join-dependency-through-aliasing.test.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, enableSti, registerSubclass } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { JoinAssociation } from "./join-dependency/join-association.js";
import { Nodes } from "@blazetrails/arel";

describe("JoinDependency Arel node construction", () => {
  let adapter: any;

  class Owner extends Base {
    static {
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
    adapter = createTestAdapter();
    Owner.adapter = adapter;
    Asset.adapter = adapter;
    (Owner as any)._associations = [];
    (Asset as any)._associations = [];
    registerModel(Owner);
    registerModel(Asset);
  });

  it("emits OuterJoin with polymorphic :as type predicate as Nodes.And", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", as: "owner" });

    const jd = new JoinDependency(Owner);
    const node = jd.addAssociation("assets");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = node!.arelJoin as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    expect(on).toBeInstanceOf(Nodes.On);

    // ON predicate is And(type='Owner', fk=pk) — joinScope adds type first, FK second
    const and = on.expr as Nodes.And;
    expect(and).toBeInstanceOf(Nodes.And);
    expect(and.children).toHaveLength(2);

    // First child: type equality (joinScope adds polymorphic type predicate first)
    const typeEq = and.children[0] as Nodes.Equality;
    expect(typeEq).toBeInstanceOf(Nodes.Equality);
    expect((typeEq.left as any).name).toBe("owner_type");
    const typeVal = typeEq.right as any;
    const resolvedType = typeVal?.value?._valueBeforeTypeCast ?? typeVal?.value ?? typeVal?.val;
    expect(resolvedType).toBe("Owner");

    // Second child: fk equality
    const eq = and.children[1] as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");
  });

  it("emits OuterJoin with STI subclass IN-list predicate", () => {
    class Vehicle extends Base {
      static {
        this.attribute("type", "string");
        this.attribute("owner_id", "integer");
      }
    }
    class Car extends Vehicle {}
    class ElectricCar extends Car {}
    enableSti(Vehicle);
    registerSubclass(Car);
    registerSubclass(ElectricCar);
    Vehicle.adapter = adapter;
    Car.adapter = adapter;
    ElectricCar.adapter = adapter;
    (Vehicle as any)._associations = [];
    (Car as any)._associations = [];
    (ElectricCar as any)._associations = [];
    registerModel(Vehicle);
    registerModel(Car);
    registerModel(ElectricCar);

    Associations.hasMany.call(Owner, "cars", { className: "Car", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner);
    const node = jd.addAssociation("cars");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = node!.arelJoin as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const and = on.expr as Nodes.And;
    expect(and).toBeInstanceOf(Nodes.And);
    expect(and.children).toHaveLength(2);

    // First child: STI IN-list (Car has descendant ElectricCar, so klass.all() produces IN)
    const inNode = and.children[0] as Nodes.In;
    expect(inNode).toBeInstanceOf(Nodes.In);
    expect((inNode.left as any).name).toBe("type");

    // Second child: FK equality
    const eq = and.children[1] as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");
  });

  it("emits simple OuterJoin for hasMany without polymorphic/STI", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner);
    const node = jd.addAssociation("assets");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = node!.arelJoin as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const eq = on.expr as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    expect((eq.left as any).name).toBe("owner_id");
    expect((eq.right as any).name).toBe("id");
  });

  it("emits OuterJoin for belongsTo with correct key direction", () => {
    Associations.belongsTo.call(Asset, "owner", { className: "Owner", foreignKey: "owner_id" });

    const jd = new JoinDependency(Asset);
    const node = jd.addAssociation("owner");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);

    const outerJoin = node!.arelJoin as Nodes.OuterJoin;
    const on = outerJoin.right as Nodes.On;
    const eq = on.expr as Nodes.Equality;
    expect(eq).toBeInstanceOf(Nodes.Equality);
    // belongsTo: targetTable.pk = sourceTable.fk
    expect((eq.left as any).name).toBe("id");
    expect((eq.right as any).name).toBe("owner_id");
  });

  it("builds joinRoot tree with children for each association", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner);
    jd.addAssociation("assets");

    expect(jd.joinRoot.baseKlass).toBe(Owner);
    expect(jd.joinRoot.children).toHaveLength(1);
    expect(jd.joinRoot.children[0]._joinNode).not.toBeNull();
    expect(jd.joinRoot.children[0]._joinNode!.immediateAssocName).toBe("assets");
    expect(jd.joinRoot.children[0].baseKlass).toBe(Asset);
  });

  it("builds nested tree for nested association paths", () => {
    class Comment extends Base {
      static {
        this.attribute("asset_id", "integer");
        this.attribute("body", "string");
      }
    }
    Comment.adapter = adapter;
    (Comment as any)._associations = [];
    registerModel(Comment);

    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });
    Associations.hasMany.call(Asset, "comments", { className: "Comment", foreignKey: "asset_id" });

    const jd = new JoinDependency(Owner);
    jd.addNestedAssociation("assets.comments");

    expect(jd.joinRoot.children).toHaveLength(1);
    const assetsNode = jd.joinRoot.children[0];
    expect(assetsNode._joinNode!.immediateAssocName).toBe("assets");
    expect(assetsNode.children).toHaveLength(1);
    const commentsNode = assetsNode.children[0];
    expect(commentsNode._joinNode!.immediateAssocName).toBe("comments");
    expect(commentsNode.baseKlass).toBe(Comment);
  });

  it("uses table alias when name collides", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner);
    // First join uses real table name
    const node1 = jd.addAssociation("assets");
    expect(node1!.effectiveSqlName).toBe("assets");
    const table1 = (node1!.arelJoin as Nodes.OuterJoin).left;
    expect((table1 as any).tableAlias).toBeNull();

    // Register second association to force collision
    (Owner as any)._associations = [];
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });
    const node2 = jd.addAssociation("assets");
    expect(node2!.effectiveSqlName).toBe("t2");
    const table2 = (node2!.arelJoin as Nodes.OuterJoin).left;
    expect((table2 as any).tableAlias).toBe("t2");
  });

  it("respects joinType constructor arg (InnerJoin)", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner, Nodes.InnerJoin);
    const node = jd.addAssociation("assets");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.InnerJoin);
  });

  it("pushes JoinAssociation into tree when reflection is available", () => {
    Associations.hasMany.call(Owner, "assets", { className: "Asset", foreignKey: "owner_id" });

    const jd = new JoinDependency(Owner);
    jd.addAssociation("assets");

    const child = jd.joinRoot.children[0];
    expect(child).toBeInstanceOf(JoinAssociation);
    expect((child as JoinAssociation).reflection).toBeDefined();
    expect(child._joinNode).not.toBeNull();
    expect(child._joinNode!.immediateAssocName).toBe("assets");
  });
});
