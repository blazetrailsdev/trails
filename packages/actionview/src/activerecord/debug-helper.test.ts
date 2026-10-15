import { describe, it, vi, afterEach } from "vitest";
import "../test-helpers/active-record-unit.js";
import * as ActiveRecord from "@blazetrails/activerecord";
import { assertMatch } from "@blazetrails/activesupport";
import { Company } from "../test-helpers/fixtures/company.js";
import { debug as _debug } from "../helpers/debug-helper.js";
import { Base } from "../base.js";

const view = new (Base.withEmptyTemplateCache())(null, {}, null);
const debug = _debug.bind(view);

describe("DebugHelperTest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debug", async () => {
    const pool = ActiveRecord.Base.connectionPool();
    await pool.schemaReflection.loadAllBang(pool);
    const company = new Company({ name: "firebase" });
    const output = debug(company).toString();
    assertMatch("name: name", output);
    assertMatch("value_before_type_cast: firebase", output);
    assertMatch("active_record_yaml_version: 2", output);
  });

  it("debug with marshal error", () => {
    const obj = () => {};
    assertMatch("[Function: obj]", debug(obj).toString());
  });
});
