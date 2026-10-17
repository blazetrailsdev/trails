import { describe, expect, it } from "vitest";
import { Builder } from "./builder.js";

describe("Builder#run", () => {
  it("runs an object that answers call", async () => {
    const app = { call: async () => [200, {}, ["OK"]] as [number, object, string[]] };
    const response = await new Builder().run(app).call({});
    expect(response[0]).toBe(200);
  });
});

describe("Builder#map", () => {
  it("stores the block and runs it on each toApp", () => {
    let runs = 0;
    const builder = new Builder().map("/foo", (b) => {
      runs++;
      b.run(async () => [200, {}, ["foo"]]);
    });
    expect(runs).toBe(0);
    builder.toApp();
    builder.toApp();
    expect(runs).toBe(2);
  });

  it("builds each mapped app with the outer default app", async () => {
    const defaultApp = async () => [200, {}, ["default"]] as [number, object, string[]];
    const builder = new Builder(defaultApp).map("/foo", () => {});
    const response = await new Builder(builder.toApp()).call({
      PATH_INFO: "/foo",
      SCRIPT_NAME: "",
    });
    expect(response[2]).toEqual(["default"]);
  });

  it("folds a pending map into the middleware stack when use follows it", async () => {
    const seen: string[] = [];
    class Tag {
      constructor(private app: (env: Record<string, unknown>) => unknown) {}
      call(env: Record<string, unknown>): unknown {
        seen.push(String(env.PATH_INFO));
        return this.app(env);
      }
    }
    const builder = new Builder()
      .map("/foo", (b) => b.run(async () => [200, {}, ["foo"]]))
      .use(Tag)
      .run(async () => [200, {}, ["root"]]);
    const app = builder.toApp() as { call(env: Record<string, unknown>): Promise<unknown[]> };
    const response = await app.call({ PATH_INFO: "/foo", SCRIPT_NAME: "" });
    expect(response[2]).toEqual(["foo"]);
    expect(seen).toEqual([]);
  });
});
