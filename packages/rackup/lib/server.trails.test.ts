import { describe, expect, it } from "vitest";
import { MockRequest } from "@blazetrails/rack";
import { File } from "@blazetrails/ruby-compat";
import { Server } from "./server.js";

describe("Server", () => {
  it("#app loads a config.ts whose Config export is the app", async () => {
    const server = new Server({ config: File.join(__dirname, "__fixtures__", "config.ts") });
    const response = await new MockRequest((await server.app()) as never).get("/");
    expect(response.body.toString()).toEqual("ts");
  });
});
