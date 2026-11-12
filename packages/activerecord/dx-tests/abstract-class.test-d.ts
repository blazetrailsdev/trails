import { describe, it, expectTypeOf } from "vitest";
import { Base } from "@blazetrails/activerecord";

abstract class ApplicationRecord extends Base {
  static {
    this.abstractClass = true;
  }
}

class Story extends ApplicationRecord {
  declare title: string;

  static {
    this.tableName = "stories";
    this.attribute("title", "string");
  }
}

describe("abstract class DX — a TypeScript abstract class as an AR abstract class", () => {
  it("a concrete subclass of an abstract class queries through inherited statics", async () => {
    expectTypeOf(await Story.where({ title: "x" })).toEqualTypeOf<Story[]>();
    expectTypeOf(await Story.create({ title: "x" })).toEqualTypeOf<Story>();
    expectTypeOf(await Story.first()).toEqualTypeOf<Story | null>();
    expectTypeOf(Story.columnNames()).toEqualTypeOf<string[]>();
    expectTypeOf(await Story.pluck("title")).toEqualTypeOf<string[]>();
    await Story.loadSchema();
    ApplicationRecord.establishConnection({ adapter: "sqlite3", database: ":memory:" });
    ApplicationRecord.where({});
    ApplicationRecord.from("stories");
    expectTypeOf(ApplicationRecord.columnNames()).toEqualTypeOf<string[]>();
  });

  it("create / new on the abstract class itself is a type error", async () => {
    // @ts-expect-error an abstract class cannot be instantiated
    void new ApplicationRecord();
    // @ts-expect-error an abstract class cannot be created
    await ApplicationRecord.create({});
  });
});
