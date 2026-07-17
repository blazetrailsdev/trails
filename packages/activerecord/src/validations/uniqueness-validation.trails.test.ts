/**
 * TS-only coverage for uniqueness validation that has no direct Rails test
 * counterpart: since RFC 0063 made the validation chain async, uniqueness runs
 * inside the context-threaded validate callback chain, so `on:` context options
 * gate it exactly like any other validator (the sibling deviation
 * `async-validations-honor-validation-context`).
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Topic } from "../test-helpers/models/topic.js";

describe("UniquenessValidationContextTest", () => {
  fixtures(["topics"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
  });

  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("uniqueness honors on: :create context", async () => {
    Topic.validatesUniqueness("title", { on: "create" });

    await Topic.createBang({ title: "ctx-unique" });

    // A brand-new record validates in the :create context, so the collision
    // is caught.
    const dup = new Topic({ title: "ctx-unique" });
    expect(await dup.isValid()).toBe(false);
    expect(dup.errors.get("title")).toEqual(["has already been taken"]);

    // A persisted record validates in the :update context, where an `on: :create`
    // validator does not fire — even though its changed title now collides.
    const other = await Topic.createBang({ title: "ctx-other" });
    other.writeAttribute("title", "ctx-unique");
    expect(await other.isValid("update")).toBe(true);
  });

  it("uniqueness honors on: :update context", async () => {
    Topic.validatesUniqueness("title", { on: "update" });

    await Topic.createBang({ title: "upd-unique" });

    // New record in :create context — the `on: :update` validator is skipped.
    const created = new Topic({ title: "upd-unique" });
    expect(await created.isValid("create")).toBe(true);

    // Persisted record in :update context — the validator fires and catches the
    // collision.
    const persisted = await Topic.createBang({ title: "upd-other" });
    persisted.writeAttribute("title", "upd-unique");
    expect(await persisted.isValid("update")).toBe(false);
    expect(persisted.errors.get("title")).toEqual(["has already been taken"]);
  });
});
