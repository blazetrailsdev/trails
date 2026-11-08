import { beforeEach, describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { DSL } from "./dsl-definition.js";
import { dsl, useRakeTestCase } from "./test-helpers/file-creation.js";

describe("TestRakeDsl", () => {
  const rake = useRakeTestCase();

  beforeEach(() => {
    rake.tm.clear();
  });

  it("namespace command", async () => {
    dsl.namespace("n", () => {
      dsl.task("t");
    });
    expect(await rake.tm.get("n:t")).not.toBeNull();
  });

  it("namespace command with bad name", () => {
    const body = () => dsl.namespace(1, () => {});
    expect(body).toThrow(ArgumentError);
    let ex: Error | undefined;
    try {
      body();
    } catch (error) {
      ex = error as Error;
    }
    expect(ex!.message).toMatch(/string/i);
    expect(ex!.message).toMatch(/symbol/i);
  });

  it("namespace command with a string like object", async () => {
    const name = { toStr: () => "bob" };
    dsl.namespace(name, () => {
      dsl.task("t");
    });
    expect(await rake.tm.get("bob:t")).not.toBeNull();
  });

  it("no commands constant", () => {
    expect(!("Commands" in DSL)).toBeTruthy();
  });
});
