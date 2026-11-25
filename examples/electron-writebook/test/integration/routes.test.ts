import { describe, expect, it } from "vitest";
import { camelize, safeConstantize } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";
import "../test-helper.ts";

describe("RoutesTest", () => {
  it("every route's controller exists", () => {
    const missing = [...Trails.application.routes().routes()].flatMap((route) => {
      const controller = route.defaults.controller as string | undefined;
      return controller && safeConstantize(`${camelize(controller)}Controller`) == null
        ? [`${route.verb} ${route.path.spec} -> ${controller}`]
        : [];
    });

    expect(missing).toEqual([]);
  });
});
