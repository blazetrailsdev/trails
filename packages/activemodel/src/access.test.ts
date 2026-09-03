/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- `Point` spells `include ActiveModel::Access` in its class body the way the Rails test model does (access_test.rb:7); the class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect, beforeEach } from "vitest";
import { include, withIndifferentAccess } from "@blazetrails/activesupport";
import { Access } from "./access.js";

describe("AccessTest", () => {
  class Point {
    #vector: unknown[];

    static {
      include(this, Access);
    }

    constructor(...vector: unknown[]) {
      this.#vector = vector;
    }

    get x(): unknown {
      return this.#vector[0];
    }

    get y(): unknown {
      return this.#vector[1];
    }

    get z(): unknown {
      return this.#vector[2];
    }
  }
  interface Point extends Access {}

  let point: Point;

  beforeEach(() => {
    point = new Point(123, 456, 789);
  });

  it("slice", () => {
    const expected = withIndifferentAccess({ z: point.z, x: point.x });
    const actual = point.slice("z", "x");

    expect([...actual.keys()]).toEqual([...expected.keys()]);

    expected.forEach((value, key) => {
      expect(actual.get(key)).toEqual(value);
      expect(actual.get(`:${key}`)).toEqual(value);
    });
  });

  it("slice with array", () => {
    const expected = withIndifferentAccess({ z: point.z, x: point.x });
    expect(point.slice(["z", "x"])).toEqual(expected);
  });

  it("values_at", () => {
    expect(point.valuesAt("x", "z")).toEqual([point.x, point.z]);
    expect(point.valuesAt("z", "x")).toEqual([point.z, point.x]);
  });

  it("values_at with array", () => {
    expect(point.valuesAt(["x", "z"])).toEqual([point.x, point.z]);
    expect(point.valuesAt(["z", "x"])).toEqual([point.z, point.x]);
  });
});
