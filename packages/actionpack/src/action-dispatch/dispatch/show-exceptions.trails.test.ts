import { describe, expect, it } from "vitest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { ShowExceptions } from "../middleware/show-exceptions.js";

const boom = async (_env: RackEnv): Promise<RackResponse> => {
  throw new Error("puke!");
};

const publicExceptionsApp = async (env: RackEnv): Promise<RackResponse> => [
  500,
  { "content-type": "text/html; charset=utf-8" },
  [`${String(env["PATH_INFO"])} error fixture\n`],
];

const exceptionsApp = async (env: RackEnv): Promise<RackResponse> => [
  500,
  { "content-type": "text/html; charset=utf-8" },
  [`${String(env["PATH_INFO"])} error fixture\n`],
];

describe("ShowExceptions#call", () => {
  it("renders the exceptions app when action_dispatch.show_exceptions is unset (exception_wrapper.rb:179-191)", async () => {
    const env: RackEnv = { REQUEST_METHOD: "GET", PATH_INFO: "/" };
    const [status, , body] = await new ShowExceptions(boom, exceptionsApp).call(env);
    expect(status).toBe(500);
    expect([...(body as Iterable<string>)].join("")).toBe("/500 error fixture\n");
    expect(env["action_dispatch.report_exception"]).toBe(true);
    expect((env["action_dispatch.exception"] as Error).message).toBe("puke!");
  });

  it("rewrites request method to GET and preserves original on env", async () => {
    let seenMethod: string | undefined;
    let seenOriginalMethod: string | undefined;
    const captureApp = async (env: RackEnv): Promise<RackResponse> => {
      seenMethod = env["REQUEST_METHOD"] as string;
      seenOriginalMethod = env["action_dispatch.original_request_method"] as string;
      return publicExceptionsApp(env);
    };

    const env: RackEnv = {
      REQUEST_METHOD: "POST",
      PATH_INFO: "/",
      "action_dispatch.show_exceptions": "all",
    };
    const app = new ShowExceptions(boom, captureApp);
    await app.call(env);

    expect(seenMethod).toBe("GET");
    expect(seenOriginalMethod).toBe("POST");
    expect(env["REQUEST_METHOD"]).toBe("POST");
  });
});
