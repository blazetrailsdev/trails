import { afterAll, beforeEach, expect } from "vitest";
import { install, flush, setCurrentFile, setTestPathResolver } from "./support/ddl-profile.js";

await install();

setTestPathResolver(() => expect.getState().testPath ?? undefined);

beforeEach((ctx) => {
  setCurrentFile(ctx?.task?.file?.filepath);
});

afterAll(() => {
  flush();
});
