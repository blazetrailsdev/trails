import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testConnection } from "@blazetrails/arel/src/test-helpers/connection.js";
import { Visitors, Nodes } from "@blazetrails/arel";
import { PredicateBuilder } from "./predicate-builder.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply } from "../test-helpers/models/reply.js";
import { quoteTableName } from "../support/quote-regex.js";
import { regexpEscape, registeredConstant, unregisterConstant } from "@blazetrails/ruby-compat";

describe("PredicateBuilderTest", () => {
  class RegexFilter {
    constructor(public source: string) {}
  }
  const regexpHandler = {
    call: (attr: any, val: RegexFilter) =>
      new Nodes.InfixOperation("~", attr, new Nodes.Quoted(val.source)),
  };

  fixtures(["topics", "posts", "authors", "products"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
    registerModel("Reply", Reply);
  });

  afterAll(() => {
    unregisterConstant("Topic", registeredConstant("Topic"));
    unregisterConstant("Reply", registeredConstant("Reply"));
  });

  it("registering new handlers", () => {
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = Topic.where({ title: new RegexFilter("rails") }).toSql();
      expect(sql).toMatch(
        new RegExp(`${regexpEscape(quoteTableName("topics.title"))} ~ 'rails'`, "i"),
      );
    } finally {
      (Topic as any)._predicateBuilder = null;
    }
  });

  it("registering new handlers for association", () => {
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = Reply.joins(":topic")
        .where({ topics: { title: new RegexFilter("rails") } })
        .toSql();
      expect(sql).toMatch(
        new RegExp(`${regexpEscape(quoteTableName("topics.title"))} ~ 'rails'`, "i"),
      );
    } finally {
      (Topic as any)._predicateBuilder = null;
    }
  });

  it("registering new handlers for joins", () => {
    class RegexpReply extends Reply {
      static {
        this.belongsTo(
          "regexp_topic",
          function (this: any) {
            return this.where({ title: new RegexFilter("rails") });
          },
          {
            className: "Topic",
            foreignKey: "parent_id",
          },
        );
      }
    }
    registerModel("RegexpReply", RegexpReply);
    Topic.predicateBuilder.registerHandler(RegexFilter, regexpHandler);
    try {
      const sql = RegexpReply.joins(":regexp_topic")
        .references(new Nodes.SqlLiteral("regexp_topic") as any)
        .toSql();
      expect(sql).toMatch(
        new RegExp(`${regexpEscape(quoteTableName("regexp_topic.title"))} ~ 'rails'`, "i"),
      );
    } finally {
      unregisterConstant("RegexpReply", registeredConstant("RegexpReply"));
      (Topic as any)._predicateBuilder = null;
    }
  });

  it("references with schema", () => {
    const refs = PredicateBuilder.references(["schema.table.column"]);
    expect(refs.map((r) => r.toString())).toEqual(["schema.table"]);
  });

  it("build from hash with schema", () => {
    const [node] = Topic.predicateBuilder.buildFromHash({
      "schema.table.column": "value",
    });
    const sql = new Visitors.ToSql(testConnection).compile(node);
    expect(sql).toMatch(/schema.+table.+column/i);
  });

  it("does not mutate", () => {
    const defaults: Record<string, unknown> = {
      topics: { title: "rails" },
      "topics.approved": true,
    };
    const original = { topics: { title: "rails" }, "topics.approved": true };
    Topic.where(defaults).toSql();
    expect(defaults).toEqual(original);
  });
});
