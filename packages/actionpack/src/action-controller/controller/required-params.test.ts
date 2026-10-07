import { beforeEach, describe, it, expect } from "vitest";
import { assertMatch, assertRaise, toParam, toQuery } from "@blazetrails/activesupport";
import "../../test-helpers/abstract-unit.js";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";
import { Parameters, ParameterMissing, UnfilteredParameters } from "../metal/strong-parameters.js";

class BooksController extends Base {
  create() {
    (this.params.require("book") as Parameters).require("name");
    this.head("ok");
  }
}

describe("ActionControllerRequiredParamsTest", () => {
  class ActionControllerRequiredParamsTest extends TestCase {
    static {
      this.tests(BooksController);
    }
  }

  let tc: ActionControllerRequiredParamsTest;

  beforeEach(async ({ task }) => {
    tc = new ActionControllerRequiredParamsTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  it("missing required parameters will raise exception", async () => {
    await assertRaise([ParameterMissing], {}, async () => {
      await tc.post("create", { params: { magazine: { name: "Mjallo!" } } });
    });

    await assertRaise([ParameterMissing], {}, async () => {
      await tc.post("create", { params: { book: { title: "Mjallo!" } } });
    });
  });

  it("exceptions have suggestions for fix", async () => {
    let error = (await assertRaise([ParameterMissing], {}, async () => {
      await tc.post("create", { params: { boko: { name: "Mjallo!" } } });
    })) as ParameterMissing;
    assertMatch("Did you mean?", error.detailedMessage());

    error = (await assertRaise([ParameterMissing], {}, async () => {
      await tc.post("create", { params: { book: { naem: "Mjallo!" } } });
    })) as ParameterMissing;
    assertMatch("Did you mean?", error.detailedMessage());
  });

  it("required parameters that are present will not raise", async () => {
    await tc.post("create", { params: { book: { name: "Mjallo!" } } });
    tc.assertResponse("ok");
  });

  it("required parameters with false value will not raise", async () => {
    await tc.post("create", { params: { book: { name: false } } });
    tc.assertResponse("ok");
  });
});

describe("ParametersRequireTest", () => {
  it("required parameters should accept and return false value", () => {
    const params = new Parameters({ person: false });
    expect(params.require("person")).toBe(false);
  });

  it("required parameters must not be nil", () => {
    const params = new Parameters({ person: null });
    expect(() => params.require("person")).toThrow(ParameterMissing);
  });

  it("required parameters must not be empty", () => {
    const params = new Parameters({ person: new Parameters({}) });
    expect(() => params.require("person")).toThrow(ParameterMissing);
  });

  it("require array when all required params are present", () => {
    const params = new Parameters({ first: "John", last: "Doe" });
    const result = params.require(["first", "last"]);
    expect(result).toEqual(["John", "Doe"]);
  });

  it("require array when a required param is missing", () => {
    const params = new Parameters({ first: "John" });
    expect(() => params.require(["first", "last"])).toThrow(ParameterMissing);
  });

  it("value params", () => {
    const params = new Parameters({ foo: "bar" });
    expect(params.get("foo")).toBe("bar");
  });

  it("to_param works like in a Hash", () => {
    const params = new Parameters({ nested: { key: "value" } }).permitBang();
    expect(params.toParam()).toBe(toParam({ nested: { key: "value" } }));

    expect(() => new Parameters({ nested: { key: "value" } }).toParam()).toThrow(
      UnfilteredParameters,
    );
  });

  it("to_query works like in a Hash", () => {
    const params = new Parameters({ nested: { key: "value" } }).permitBang();
    expect(params.toQuery()).toBe(toQuery({ nested: { key: "value" } }));

    expect(() => new Parameters({ nested: { key: "value" } }).toQuery()).toThrow(
      UnfilteredParameters,
    );
  });
});
