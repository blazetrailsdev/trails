import { describe, it, expect, afterEach } from "vitest";
import { controllerConstants, type Route } from "@blazetrails/actionpack";
import { createProgram } from "../cli.js";
import { RouteInfo } from "./unused-routes.js";

function route(requirements: Record<string, string>): Route {
  return { requirements } as unknown as Route;
}

describe("UnusedRoutesCommand", () => {
  afterEach(() => {
    controllerConstants.clear();
  });

  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "unused_routes")).toBe(true);
  });

  it("is hidden, mirroring hide_command!", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "unused_routes");
    expect(cmd?.helpInformation).toBeDefined();
    expect(
      program
        .createHelp()
        .visibleCommands(program)
        .map((c) => c.name()),
    ).not.toContain("unused_routes");
  });

  it("has the class options UnusedRoutesCommand declares", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "unused_routes");
    const longs = cmd?.options.map((o) => o.long);
    expect(longs).toEqual(expect.arrayContaining(["--controller", "--grep"]));
  });

  it("routes gains the -u/--unused class option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "routes");
    const unused = cmd?.options.find((o) => o.long === "--unused");
    expect(unused?.short).toBe("-u");
  });

  describe("RouteInfo", () => {
    it("no controller", async () => {
      const info = new RouteInfo(route({ controller: "posts", action: "index" }));
      expect(await info.unused()).toBe(true);
    });

    it("action present", async () => {
      class PostsController {
        index(): void {}
      }
      controllerConstants.set("posts", PostsController as never);
      const info = new RouteInfo(route({ controller: "posts", action: "index" }));
      expect(await info.unused()).toBe(false);
    });

    it("no action", async () => {
      class PostsController {}
      controllerConstants.set("posts", PostsController as never);
      const info = new RouteInfo(route({ controller: "posts", action: "index" }));
      expect(await info.unused()).toBe(true);
    });

    it("implicit render", async () => {
      class PostsController {
        static viewPaths(): { path: string }[] {
          return [{ path: new URL("./__fixtures__/views", import.meta.url).pathname }];
        }
      }
      controllerConstants.set("posts", PostsController as never);
      const info = new RouteInfo(route({ controller: "posts", action: "index" }));
      expect(await info.unused()).toBe(false);
    });
  });
});
