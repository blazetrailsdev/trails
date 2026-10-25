import { describe, expect, it } from "vitest";
import { EtOrbi } from "@blazetrails/et-orbi";
import { registeredConstant } from "@blazetrails/ruby-compat";
import { Trails } from "./rails.js";

describe("Trails registered constant", () => {
  it("registers Trails as a top-level constant", () => {
    expect(registeredConstant("Trails")).toBe(Trails);
  });

  it("answers et-orbi's rorv with Trails::VERSION::STRING", () => {
    expect(EtOrbi.platformInfo()).toContain(`rorv:"${Trails.VERSION.STRING}"`);
  });
});
