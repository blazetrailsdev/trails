import { describe, it, expect } from "vitest";
import { Base } from "../../lib/index.js";

describe("ModelSchema static fields", () => {
  it("a static tableName field has the writer's effect and is read through an abstract parent's reset_table_name", () => {
    class Application extends Base {
      static override abstractClass = true;
      static override tableName = "topics";
    }
    class Reply extends Application {}
    void Reply.baseClass;
    expect(Object.getOwnPropertyDescriptor(Application, "tableName")).toBeUndefined();
    expect(Application.tableName).toBe("topics");
    expect(Reply.tableName).toBe("topics");
  });

  it("a static tableName field is inherited by an STI subclass", () => {
    class Topic extends Base {
      static override tableName = "topics";
    }
    class Reply extends Topic {}
    void Reply.baseClass;
    expect(Reply.tableName).toBe("topics");
  });

  it("a static primaryKey field runs the writer, composite included", () => {
    class Application extends Base {
      static override abstractClass = true;
      static override primaryKey: string | string[] = ["shop_id", "id"];
    }
    class Order extends Application {}
    void Order.baseClass;
    expect(Object.getOwnPropertyDescriptor(Application, "primaryKey")).toBeUndefined();
    expect(Application.primaryKey).toEqual(["shop_id", "id"]);
    expect((Application as unknown as { _compositePrimaryKey: boolean })._compositePrimaryKey).toBe(
      true,
    );
    expect(Order.primaryKey).toBe("id");
  });

  it("a static sequenceName field runs the writer", async () => {
    class Application extends Base {
      static override abstractClass = true;
      static override sequenceName = "seq" as unknown as Promise<string | null>;
    }
    class Order extends Application {}
    void Order.baseClass;
    expect(Object.getOwnPropertyDescriptor(Application, "sequenceName")).toBeUndefined();
    expect(await Application.sequenceName).toBe("seq");
  });

  it("static inheritanceColumn and ignoredColumns fields run the writers and are inherited", () => {
    class Topic extends Base {
      static override inheritanceColumn: string | null = "kind";
      static override ignoredColumns = ["legacy"];
    }
    class Reply extends Topic {}
    void Reply.baseClass;
    expect(Object.getOwnPropertyDescriptor(Topic, "inheritanceColumn")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(Topic, "ignoredColumns")).toBeUndefined();
    expect(Reply.inheritanceColumn).toBe("kind");
    expect(Reply.ignoredColumns).toEqual(["legacy"]);
    expect(Object.isFrozen(Topic.ignoredColumns)).toBe(true);
  });

  it("a static primaryKey field is handed to its writer by the first class-level reader, with no base_class read", () => {
    class Order extends Base {
      static override tableName = "cpk_orders";
      static override primaryKey: string | string[] = ["shop_id", "id"];
    }
    expect(Order.isCompositePrimaryKey()).toBe(true);
    expect(Object.getOwnPropertyDescriptor(Order, "primaryKey")).toBeUndefined();
    expect(Order.arelTable.name).toBe("cpk_orders");
  });

  it("a bare tableName and primaryKey read, before any other class-level reader, answers the writer's value", () => {
    class Application extends Base {
      static override abstractClass = true;
      static override tableName = "topics";
      static override primaryKey: string | string[] = "id";
    }
    class Reply extends Application {}
    expect(Reply.tableName).toBe("topics");
    expect(Application.tableName).toBe("topics");
    expect(Reply.primaryKey).toBe("id");
  });
});
