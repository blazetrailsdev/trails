import { beforeEach, describe, it } from "vitest";
import { File, StringIO, type Tempfile } from "@blazetrails/ruby-compat";
import { Date, DateTime, Time } from "@blazetrails/date";
import { UploadedFile as RackTestUploadedFile } from "@blazetrails/rack-test";
import { BigDecimal, assertEqual, assertPredicate, assertRaises } from "@blazetrails/activesupport";
import { UploadedFile } from "../../../action-dispatch/http/upload.js";
import {
  ExpectedParameterMissing,
  Parameters,
  ParameterMissing,
} from "../../metal/strong-parameters.js";

const thisFile = new URL(import.meta.url).pathname;

describe("ParametersExpectTest", () => {
  let params: Parameters;

  beforeEach(() => {
    params = new Parameters({
      person: {
        age: "32",
        name: {
          first: "David",
          last: "Heinemeier Hansson",
        },
        addresses: [{ city: "Chicago", state: "Illinois" }],
      },
    });
  });

  it("key to array: returns only permitted scalar keys", () => {
    const permitted = params.expect({ person: ["age", "name", "addresses"] });

    assertEqual({ age: "32" }, permitted.toUnsafeH());
  });

  it("key to hash: returns permitted params", () => {
    const permitted = params.expect({ person: { name: ["first", "last"] } }) as Parameters;

    assertEqual({ name: { first: "David", last: "Heinemeier Hansson" } }, permitted.toH());
  });

  it("key to empty hash: permits all params", () => {
    const permitted = params.expect({ person: {} }) as Parameters;

    assertEqual(
      {
        age: "32",
        name: { first: "David", last: "Heinemeier Hansson" },
        addresses: [{ city: "Chicago", state: "Illinois" }],
      },
      permitted.toH(),
    );
    assertPredicate(permitted, (p) => p.permitted);
  });

  it("keys to arrays: returns permitted params in hash key order", () => {
    const [name, addresses] = (params.get("person") as Parameters).expect({
      name: ["first", "last"],
      addresses: [["city"]],
    }) as [Parameters, Parameters[]];

    assertEqual({ first: "David", last: "Heinemeier Hansson" }, name.toH());
    assertEqual({ city: "Chicago" }, addresses[0].toH());
  });

  it("key to array of keys: raises when params is an array", async () => {
    const params = new Parameters({ name: "Martin", pies: [{ flavor: "pumpkin" }] });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ pies: ["flavor"] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ pies: ["flavor"] });
    });
  });

  it("key to explicit array: returns permitted array", () => {
    const params = new Parameters({
      name: "Martin",
      pies: [{ flavor: "pumpkin" }, { flavor: "chicken pot" }],
    });
    const pies = params.expect({ pies: [["flavor"]] }) as Parameters[];

    assertEqual({ flavor: "pumpkin" }, pies[0].toH());
    assertEqual({ flavor: "chicken pot" }, pies[1].toH());
  });

  it("key to explicit array: returns array when params is a hash", async () => {
    const params = new Parameters({ name: "Martin", pies: { flavor: "pumpkin" } });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ pies: [["flavor"]] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ pies: [["flavor"]] });
    });
  });

  it("key to explicit array: returns empty array when params empty array", async () => {
    const params = new Parameters({ name: "Martin", pies: [] });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ pies: [["flavor"]] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ pies: [["flavor"]] });
    });
  });

  it("key to mixed array: returns permitted params", () => {
    const permitted = params.expect({ person: ["age", { name: ["first", "last"] }] });

    assertEqual(
      { age: "32", name: { first: "David", last: "Heinemeier Hansson" } },
      permitted.toH(),
    );
  });

  it("chain of keys: returns permitted params", () => {
    const params = new Parameters({ person: { name: "David" } });
    const name = (params.expect({ person: "name" }) as Parameters).expect("name");

    assertEqual("David", name);
  });

  it("array of key: returns single permitted param", () => {
    const params = new Parameters({ a: 1, b: 2 });
    const a = params.expect("a");

    assertEqual(1, a);
  });

  it("array of keys: returns multiple permitted params", () => {
    const params = new Parameters({ a: 1, b: 2 });
    const [a, b] = params.expect("a", "b");

    assertEqual(1, a);
    assertEqual(2, b);
  });

  it("key: raises ParameterMissing on nil, blank, non-scalar or non-permitted type", async () => {
    const values = [null, "", {}, [], [1], { foo: "bar" }, new (class {})()];
    for (const value of values) {
      const params = new Parameters({ id: value });

      await assertRaises([ParameterMissing], {}, () => {
        params.expect("id");
      });
      await assertRaises([ExpectedParameterMissing], {}, () => {
        params.expectBang({ pies: [["flavor"]] });
      });
    }
  });

  it("key: raises ParameterMissing if not present in params", async () => {
    const params = new Parameters({ name: "Joe" });
    await assertRaises([ParameterMissing], {}, () => {
      params.expect("id");
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang("id");
    });
  });

  it("key to empty array: raises ParameterMissing on empty", async () => {
    const params = new Parameters({ ids: [] });
    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ ids: [] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ ids: [] });
    });
  });

  it("key to empty array: raises ParameterMissing on scalar", async () => {
    const params = new Parameters({ person: 1 });
    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ ids: [] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ ids: [] });
    });
  });

  it("key to non-scalar: raises ParameterMissing on scalar", async () => {
    const params = new Parameters({ foo: "bar" });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ foo: [] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ foo: [] });
    });
    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ foo: ["bar"] });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ foo: ["bar"] });
    });
    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ foo: "bar" });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ foo: "bar" });
    });
  });

  it("key to empty hash: raises ParameterMissing on empty", async () => {
    const params = new Parameters({ person: {} });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ person: {} });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ person: {} });
    });
  });

  it("key to empty hash: raises ParameterMissing on scalar", async () => {
    const params = new Parameters({ person: 1 });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect({ person: {} });
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang({ person: {} });
    });
  });

  it("key: permitted scalar values", () => {
    /** @noRailsEquivalent PERMANENT */
    const STDOUT = File.open(thisFile, "r");

    let values: unknown[] = ["a", ":a"];
    values = values.concat([0, 1.0, 2n ** 128n, new BigDecimal(1)]);
    values = values.concat([true, false]);
    values = values.concat([Date.today(), Time.now(), DateTime.now()]);
    values = values.concat([
      STDOUT,
      new StringIO(),
      new UploadedFile({ tempfile: thisFile as unknown as Tempfile }),
      new RackTestUploadedFile(thisFile),
    ]);

    for (const value of values) {
      const params = new Parameters({ id: value });

      assertEqual(value, params.expect("id"));
    }
  });

  it("key: unknown keys are filtered out", () => {
    const params = new Parameters({ id: "1234", injected: "injected" });

    assertEqual("1234", params.expect("id"));
  });

  it("array of keys: raises ParameterMissing when one is missing", async () => {
    const params = new Parameters({ a: 1 });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect(["a", "b"] as never);
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang(["a", "b"] as never);
    });
  });

  it("array of keys: raises ParameterMissing when one is non-scalar", async () => {
    const params = new Parameters({ a: 1, b: [] });

    await assertRaises([ParameterMissing], {}, () => {
      params.expect(["a", "b"] as never);
    });
    await assertRaises([ExpectedParameterMissing], {}, () => {
      params.expectBang(["a", "b"] as never);
    });
  });

  it("key to empty array: arrays of permitted scalars pass", () => {
    for (const array of [["foo"], [1], ["foo", "bar"], [1, 2, 3]]) {
      const params = new Parameters({ id: array });
      const permitted = params.expect({ id: [] });
      assertEqual(array, permitted);
    }
  });

  it("key to empty array: arrays of non-permitted scalar do not pass", async () => {
    for (const nonPermittedScalar of [[new (class {})()], [[]], [[1]], [{}], [{ id: "1" }]]) {
      const params = new Parameters({ id: nonPermittedScalar });
      await assertRaises([ParameterMissing], {}, () => {
        params.expect({ id: [] });
      });
      await assertRaises([ExpectedParameterMissing], {}, () => {
        params.expectBang({ id: [] });
      });
    }
  });
});
