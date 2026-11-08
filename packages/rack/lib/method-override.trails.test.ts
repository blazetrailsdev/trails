import { it, expect } from "vitest";
import { MethodOverride } from "./method-override.js";
import { MockRequest } from "./mock-request.js";

it("writes error to RACK_ERRORS when using incompatible multipart encoding", async () => {
  const app = new MethodOverride(async (env) => {
    return [200, {}, [env["REQUEST_METHOD"]]];
  });
  const res = await new MockRequest(app).post("/", {
    CONTENT_TYPE: "multipart/form-data; boundary=AaB03x",
    ":input": "not valid multipart",
  });
  expect(res.status).toBe(200);
});
