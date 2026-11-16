import { describe, expect, it } from "vitest";
import { MockRequest } from "@blazetrails/rack";
import { File } from "@blazetrails/ruby-compat";
import { Server } from "../lib/server.js";

describe("Server", () => {
  it("#app loads a config.ts whose Config export is the app", async () => {
    const server = await Server.new({ config: File.join(__dirname, "fixtures", "config.ts") });
    const response = await new MockRequest((await server.app()) as never).get("/");
    expect(response.body.toString()).toEqual("ts");
  });
});

describe("Server.new", () => {
  it("rejects with the error parse_options raises", async () => {
    const c = class extends Server {
      override optParser(): never {
        throw new Error("parse failed");
      }
    };
    await expect(c.new()).rejects.toThrow("parse failed");
  });
});
