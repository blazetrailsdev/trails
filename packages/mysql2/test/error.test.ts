import "@blazetrails/vitest-matchers";
import { describe, expect, it } from "vitest";
import { Mysql2 } from "../lib/index.js";
import { specHelper } from "./spec-helper.js";
describe("Mysql2::Error", () => {
  const state = specHelper();
  it("responds to error_number and sql_state, with aliases", async () => {
    let error: InstanceType<typeof Mysql2.Error> | null = null;
    try {
      await state.client.query("HAHAHA");
    } catch (e) {
      if (!(e instanceof Mysql2.Error)) throw e;
      error = e;
    }
    expect(error!).toRespondTo("errorNumber");
    expect(error!).toRespondTo("sqlState");

    expect(error!).toRespondTo("errno");
    expect(error!).toRespondTo("error");
  });
  describe("encoding", () => {
    // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
    it.skip("returns error messages as UTF-8 by default", () => {});
    it.skip("returns sql state as ASCII", () => {});
    it.skip("returns error messages and sql state in Encoding.default_internal if set", () => {});
  });
});
