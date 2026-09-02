import { describe, it, expect } from "vitest";
import "../index.js";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { Topic } from "../test-helpers/models/topic.js";

describe("HashWithIndifferentAccess where conditions", () => {
  it("builds the same where clause as the plain hash it stands for", () => {
    const hash = new HashWithIndifferentAccess<unknown>({ id: 1 });
    expect(Topic.where(hash).toSql()).toEqual(Topic.where({ id: 1 }).toSql());
  });

  it("builds the same where clause from the Map spelling", () => {
    expect(Topic.where(new Map([["id", 1]])).toSql()).toEqual(Topic.where({ id: 1 }).toSql());
  });

  it("resolves attribute aliases and references for the Map spelling too", () => {
    expect(Topic.where(new Map([["heading", "x"]])).toSql()).toEqual(
      Topic.where({ heading: "x" }).toSql(),
    );
  });

  it("is a no-op for the empty Map, as `where({})` is", () => {
    expect(Topic.where(new Map()).toSql()).toEqual(Topic.where({}).toSql());
  });
});
