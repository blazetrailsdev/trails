import { describe, expect, it } from "vitest";
import { ActionController, ActionDispatch } from "@blazetrails/actionpack";
import { Base } from "@blazetrails/activerecord";
import { StringIO } from "@blazetrails/ruby-compat";

type FindByTitle = { findByTitle(title: unknown): Promise<unknown> };

describe("JsonParamsParsingTest", () => {
  function makeEnv(json: unknown): Record<string, unknown> {
    const data = JSON.stringify(json);
    const contentLength = data.length;
    return {
      CONTENT_LENGTH: contentLength,
      CONTENT_TYPE: "application/json",
      "rack.input": new StringIO(data),
    };
  }

  it("prevent null query", async () => {
    class Foo extends Base {}
    await Foo.establishConnection({ adapter: "sqlite3", database: ":memory:" });
    try {
      await (
        await Foo.leaseConnection()
      ).createTable("foos", (t) => {
        t.string("title");
        t.timestamps({ null: false });
      });
      await Foo.create();
      expect(await Foo.first()).toBeTruthy();

      const app = async (env: Record<string, unknown>): Promise<unknown> => {
        const request = new ActionDispatch.Request(env);
        const params = new ActionController.Parameters(request.parameters);
        if (params.get("t") != null) {
          return (Foo as unknown as FindByTitle).findByTitle(params.get("t"));
        } else {
          return null;
        }
      };

      expect(await app(makeEnv({ t: null }))).toBeNull();
      expect(await app(makeEnv({ t: [null] }))).toBeNull();

      for (const data of [[[null]], [[[null]]]]) {
        expect(await app(makeEnv({ t: data }))).toBeNull();
      }
    } finally {
      await (await Foo.leaseConnection()).dropTable("foos");
    }
  });
});
