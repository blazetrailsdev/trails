import { beforeEach, describe, it } from "vitest";
import {
  assert,
  assertEqual,
  assertKindOf,
  assertMatch,
  assertRaise,
  assertRaises,
  toParam,
  toQuery,
} from "@blazetrails/activesupport";
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
    assertEqual(false, new Parameters({ person: false }).require("person"));
  });

  it("required parameters must not be nil", () => {
    assertRaises([ParameterMissing], {}, () => {
      new Parameters({ person: null }).require("person");
    });
  });

  it("required parameters must not be empty", () => {
    assertRaises([ParameterMissing], {}, () => {
      new Parameters({ person: {} }).require("person");
    });
  });

  it("require array when all required params are present", () => {
    const safeParams = (
      new Parameters({
        person: { first_name: "Gaurish", title: "Mjallo", city: "Barcelona" },
      }).require("person") as Parameters
    ).require(["first_name", "title"]);

    assertKindOf(Array, safeParams);
    assertEqual(["Gaurish", "Mjallo"], safeParams);
  });

  it("require array when a required param is missing", () => {
    assertRaises([ParameterMissing], {}, () => {
      (
        new Parameters({ person: { first_name: "Gaurish", title: null } }).require(
          "person",
        ) as Parameters
      ).require(["first_name", "title"]);
    });
  });

  it("value params", () => {
    const params = new Parameters({ foo: "bar", dog: "cinco" });
    assertEqual(["bar", "cinco"], params.values);
    assert(params.hasValue("cinco"));
    assert(params.isValue("cinco"));
  });

  it("to_param works like in a Hash", () => {
    let params: Parameters | { root: Parameters } = new Parameters({
      nested: { key: "value" },
    }).permitBang();
    assertEqual(toParam({ nested: { key: "value" } }), params.toParam());

    params = { root: new Parameters({ nested: { key: "value" } }).permitBang() };
    assertEqual(toParam({ root: { nested: { key: "value" } } }), toParam(params));

    assertRaise([UnfilteredParameters], {}, () => {
      new Parameters({ nested: { key: "value" } }).toParam();
    });
  });

  it("to_query works like in a Hash", () => {
    let params: Parameters | { root: Parameters } = new Parameters({
      nested: { key: "value" },
    }).permitBang();
    assertEqual(toQuery({ nested: { key: "value" } }), params.toQuery());

    params = { root: new Parameters({ nested: { key: "value" } }).permitBang() };
    assertEqual(toQuery({ root: { nested: { key: "value" } } }), toQuery(params));

    assertRaise([UnfilteredParameters], {}, () => {
      new Parameters({ nested: { key: "value" } }).toQuery();
    });
  });
});
