import { describe, it, expect, afterEach } from "vitest";
import { callerLocations } from "@blazetrails/activesupport";
import { Mapper } from "./action-dispatch/routing/mapper.js";
import { RouteSet } from "./action-dispatch/routing/route-set.js";
import { ConsoleFormatter, RoutesInspector } from "./action-dispatch/routing/inspector.js";

describe("Mapping#routeSourceLocation", () => {
  afterEach(() => {
    Mapper.routeSourceLocations = false;
  });

  it("renders the Source Location row of the first caller outside action-dispatch", () => {
    Mapper.routeSourceLocations = true;
    const set = new RouteSet();
    const lineno = callerLocations(0, 1)[0].lineno;
    set.draw(function () {
      this.get("/custom/assets", { to: "custom_assets#show" });
    });

    const output = new RoutesInspector(set.routes).format(new ConsoleFormatter.Expanded(23));
    expect(output).toMatch(
      new RegExp(
        `Source Location   \\| \\S*routing-source-location\\.trails\\.test\\.ts:${lineno + 2}$`,
        "m",
      ),
    );
  });

  it("omits the Source Location row when route_source_locations is off", () => {
    const set = new RouteSet();
    set.draw(function () {
      this.get("/custom/assets", { to: "custom_assets#show" });
    });
    const output = new RoutesInspector(set.routes).format(new ConsoleFormatter.Expanded());
    expect(output).not.toContain("Source Location");
  });
});
