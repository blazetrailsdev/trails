import { it, expect } from "vitest";
import { CommonLogger } from "./common-logger.js";

it("writes the log line when the body is closed, not when the app returns", async () => {
  let logged = "";
  const logger = {
    write(s: string) {
      logged += s;
    },
  };
  const app = async () => [200, { "content-type": "text/plain" }, ["ok"]] as [number, any, any];
  const response = await new CommonLogger(app, logger).call({
    REQUEST_METHOD: "GET",
    SCRIPT_NAME: "",
    PATH_INFO: "/hello",
    QUERY_STRING: "",
    SERVER_PROTOCOL: "HTTP/1.1",
  });

  expect(logged).toBe("");
  response[2].close();
  expect(logged).toMatch(/"GET \/hello HTTP\/1\.1" 200 /);
});
