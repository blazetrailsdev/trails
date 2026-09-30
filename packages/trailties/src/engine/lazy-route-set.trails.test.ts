import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Mapper } from "@blazetrails/actionpack";
import { controllerConstants } from "@blazetrails/actionpack";
import { NoMethodError } from "@blazetrails/ruby-compat";
import { LazyRouteSet } from "./lazy-route-set.js";
import { Trails } from "../rails.js";

class StubController {}

type MethodMissingHost = { methodMissing(name: string, ...args: unknown[]): Promise<unknown> };

describe("LazyRouteSet method_missing_module", () => {
  let routes: LazyRouteSet;

  beforeEach(() => {
    routes = new LazyRouteSet();
    let loaded = false;
    Trails.application = {
      async reloadRoutesUnlessLoaded(): Promise<boolean | null> {
        if (loaded) return null;
        loaded = true;
        routes.draw((m: Mapper) => {
          m.root({ to: "posts#index" });
        });
        return true;
      },
    } as never;
    controllerConstants.set("posts", StubController as never);
  });

  afterEach(() => {
    Trails.application = null;
  });

  it("method_missing loads the routes and re-sends the helper", async () => {
    const helpers = routes.urlHelpers() as unknown as MethodMissingHost;
    expect(await helpers.methodMissing("rootPath")).toBe("/");
  });

  it("method_missing raises NoMethodError once the routes are loaded", async () => {
    const helpers = routes.urlHelpers() as unknown as MethodMissingHost;
    await helpers.methodMissing("rootPath");
    await expect(helpers.methodMissing("mumboPath")).rejects.toBeInstanceOf(NoMethodError);
  });
});
