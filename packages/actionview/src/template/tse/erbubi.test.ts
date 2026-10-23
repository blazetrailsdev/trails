import { describe, expect, it } from "vitest";
import { compileJs } from "@blazetrails/tse-compiler";

describe("ErubiTest", () => {
  it("can configure bufvar", () => {
    const template = `foo

<%= "foo".toUpperCase() %>

<%== "foo".length %>
`;

    const baseline = compileJs(template);
    const erubi = compileJs(template, { bufvar: "boofer" });

    expect(erubi.code).toBe(baseline.code.replaceAll("context.outputBuffer", "boofer"));
  });
});
