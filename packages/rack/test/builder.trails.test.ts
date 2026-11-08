import { it, expect } from "vitest";
import { Dir, File, NameError } from "@blazetrails/ruby-compat";
import { Builder } from "../lib/builder.js";
import { MockRequest } from "../lib/mock-request.js";

it("handles builder with no middleware and just run", async () => {
  const builder = new Builder();
  builder.run(async () => [200, {}, ["simple"]]);
  const app = builder.toApp();
  const res = await new MockRequest(app).get("/");
  expect(res.body).toBe("simple");
});

it("parse_file raises NameError when a .ts config defines no constant named after its file", async () => {
  await expect(
    Builder.parseFile(File.join(__dirname, "__fixtures__", "no_constant_app.ts")),
  ).rejects.toThrow(NameError);
});

it("parse_file propagates a .ru config's SyntaxError unwrapped", async () => {
  const path = File.join(Dir.tmpdir(), `syntax_error_${Date.now()}.ru`);
  await File.writeAsync(path, "builder.run(;\n");
  try {
    await expect(Builder.parseFile(path)).rejects.toMatchObject({ name: "SyntaxError" });
  } finally {
    await File.deleteAsync(path);
  }
});

it("parse_file propagates a .ru config's error unwrapped", async () => {
  const path = File.join(Dir.tmpdir(), `raising_${Date.now()}.ru`);
  await File.writeAsync(path, "throw new TypeError('boom');\n");
  try {
    await expect(Builder.parseFile(path)).rejects.toMatchObject({
      name: "TypeError",
      message: "boom",
    });
  } finally {
    await File.deleteAsync(path);
  }
});
