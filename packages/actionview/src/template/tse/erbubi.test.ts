import { describe, expect, it } from "vitest";
import { Erubi } from "../handlers/tse/erubi.js";

describe("ErubiTest", () => {
  it("can configure bufvar", () => {
    const template = `foo

<%= "foo".toUpperCase() %>

<%== "foo".length %>
`;

    const baseline = new Erubi(template);
    const erubi = new Erubi(template, { bufvar: "boofer" });

    expect(erubi.src).toBe(baseline.src.replaceAll(baseline.bufvar, "boofer"));
  });
});
