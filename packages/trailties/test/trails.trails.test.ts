import { describe, expect, it } from "vitest";
import { EtOrbi } from "@blazetrails/et-orbi";
import { constGet } from "@blazetrails/ruby-compat";
import { Trails } from "../lib/trails.js";

describe("Trails registered constant", () => {
  it("registers Trails as a top-level constant", () => {
    expect(constGet(Object, "Trails")).toBe(Trails);
  });

  it("answers et-orbi's rorv with Trails::VERSION::STRING", () => {
    expect(EtOrbi.platformInfo()).toContain(`rorv:"${Trails.VERSION.STRING}"`);
  });
});
