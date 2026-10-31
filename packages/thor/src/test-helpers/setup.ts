import { beforeAll, beforeEach } from "vitest";

beforeAll(async () => {
  await import("./helper.js");
});

beforeEach(async () => {
  const { rbArgv } = await import("@blazetrails/ruby-compat");
  rbArgv().length = 0;
});
