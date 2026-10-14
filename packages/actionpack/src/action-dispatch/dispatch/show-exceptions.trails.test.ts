import { describe, expect, it } from "vitest";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString, bodyToString } from "@blazetrails/rack";
import { ShowExceptions } from "../middleware/show-exceptions.js";

const boom = async (_env: RackEnv): Promise<RackResponse> => {
  throw new Error("puke!");
};

const exceptionsApp = async (env: RackEnv): Promise<RackResponse> => [
  500,
  { "content-type": "text/html; charset=utf-8" },
  bodyFromString(`${String(env["PATH_INFO"])} error fixture\n`),
];

describe("ShowExceptions#call", () => {
  it("renders the exceptions app when action_dispatch.show_exceptions is unset (exception_wrapper.rb:179-191)", async () => {
    const env: RackEnv = { REQUEST_METHOD: "GET", PATH_INFO: "/" };
    const [status, , body] = await new ShowExceptions(boom, exceptionsApp).call(env);
    expect(status).toBe(500);
    expect(await bodyToString(body)).toBe("/500 error fixture\n");
    expect(env["action_dispatch.report_exception"]).toBe(true);
    expect((env["action_dispatch.exception"] as Error).message).toBe("puke!");
  });
});
