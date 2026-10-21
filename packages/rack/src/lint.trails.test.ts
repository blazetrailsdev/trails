import { it, expect } from "vitest";
import { StringIO, Tempfile } from "@blazetrails/ruby-compat";
import { Lint } from "./lint.js";
import { MockRequest } from "./mock-request.js";

it("rack.multipart.tempfile_factory accepts a StringIO or Tempfile return value", async () => {
  for (const factory of [() => new StringIO(), () => Tempfile.new("testfile")]) {
    const response = await new Lint(async (env) => {
      const io = env["rack.multipart.tempfile_factory"]("testfile", "text/plain");
      io.append("x");
      if (io instanceof Tempfile) io.close(true);
      return [201, { "content-type": "text/plain", "content-length": "0" }, []];
    }).call(MockRequest.envFor("/", { ":input": "", "rack.multipart.tempfile_factory": factory }));
    expect(response[0]).toBe(201);
  }
});
