import { describe, expect, it } from "vitest";
import { Pathname } from "@blazetrails/ruby-compat";
import { existence } from "../../../lib/core-ext/pathname/existence.js";

describe("PathnameExistenceTest", () => {
  it("existence", () => {
    const existing = new Pathname(import.meta.filename);
    const notExisting = new Pathname("not existing");
    expect(existence(existing)).toEqual(existing);
    expect(existence(notExisting)).toBeNull();
  });
});
