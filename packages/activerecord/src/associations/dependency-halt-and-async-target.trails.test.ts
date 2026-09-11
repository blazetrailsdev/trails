import { describe, it, expect } from "vitest";
import { isAbortSignal } from "@blazetrails/activesupport";
import { NotImplementedError } from "@blazetrails/ruby-compat";
import { HasOneAssociation } from "./has-one-association.js";
import { HasManyAssociation } from "./has-many-association.js";
import { HasManyThroughAssociation } from "./has-many-through-association.js";

function restrictWithErrorHost(extra: Record<string, unknown>) {
  const owner = {
    errors: { add: () => {} },
    constructor: { humanAttributeName: (n: string) => n },
  };
  return {
    reflection: { name: "account", options: { dependent: "restrictWithError" } },
    owner,
    ...extra,
  };
}

async function abortOf(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    return isAbortSignal(e);
  }
}

describe("dependent: :restrict_with_error halts with throw(:abort)", () => {
  it("HasOneAssociation#handle_dependency throws abort when a target exists", async () => {
    const host = restrictWithErrorHost({ loadTarget: async () => ({}) });
    expect(await abortOf(HasOneAssociation.prototype.handleDependency.call(host as never))).toBe(
      true,
    );
  });

  it("HasManyAssociation#handle_dependency throws abort when the collection is not empty", async () => {
    const host = restrictWithErrorHost({ isEmpty: async () => false });
    expect(await abortOf(HasManyAssociation.prototype.handleDependency.call(host as never))).toBe(
      true,
    );
  });

  it("HasOneAssociation#delete throws abort when the destroyed target was not destroyed", async () => {
    const target = { destroy: async () => false, isDestroyed: () => false };
    const host = { reflection: { options: {} }, loadTarget: async () => target, target };
    const del = HasOneAssociation.prototype.delete;
    expect(await abortOf(del.call(host as never, "destroy"))).toBe(true);
  });
});

describe("HasManyThroughAssociation#find_target", () => {
  it("raises NotImplementedError for async loading", async () => {
    const findTarget = (
      HasManyThroughAssociation.prototype as unknown as {
        findTarget: (o: object) => Promise<unknown>;
      }
    ).findTarget;
    await expect(findTarget.call({}, { async: true })).rejects.toThrow(
      new NotImplementedError("No async loading for HasManyThroughAssociation yet"),
    );
  });
});
