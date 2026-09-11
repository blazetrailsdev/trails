import { describe, it, expect, beforeAll } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { ActiveRecordError, MultiparameterAssignmentErrors } from "./index.js";
import { baseClass } from "./inheritance.js";
import { fixtures } from "./test-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Post } from "./test-helpers/models/post.js";
import { Customer } from "./test-helpers/models/customer.js";

describe("raise sites Rails has and the port had dropped", () => {
  fixtures(["topics", "posts", "customers"]);

  beforeAll(async () => {
    await Topic.loadSchema();
    await Customer.loadSchema();
  });

  it("MultiparameterAssignmentErrors carries Rails' summary message", () => {
    const topic = new Topic();
    let error: unknown;
    try {
      topic.assignAttributes({ "written_on(4i)": "16", "written_on(5i)": "24" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MultiparameterAssignmentErrors);
    expect((error as Error).message).toMatch(
      /^1 error\(s\) on assignment of multiparameter attributes \[error on assignment \[16, 24\] to written_on \(/,
    );
  });

  it("a composed_of without allow_nil raises on all-blank multiparameter values", () => {
    const customer = new Customer();
    expect(() => customer.assignAttributes({ "balance(1)": "" })).toThrow(
      MultiparameterAssignmentErrors,
    );
  });

  it("base_class raises outside an ActiveRecord hierarchy", () => {
    class Plain {}
    expect(() => baseClass.call(Plain as never)).toThrow(ActiveRecordError);
    expect(() => baseClass.call(Plain as never)).toThrow(
      "Plain doesn't belong in a hierarchy descending from ActiveRecord",
    );
  });

  it("build_join_buckets raises RuntimeError on an unknown join class", () => {
    expect(() => Post.joins(42 as never).toSql()).toThrow(RuntimeError);
  });
});
