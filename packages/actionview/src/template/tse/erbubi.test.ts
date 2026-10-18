import { describe, expect, it } from "vitest";
import { compileJs } from "@blazetrails/tse-compiler";

describe("ErubiTest", () => {
  // BLOCKED: port-erb-erubi-bufvar
  it.skip("can configure bufvar", () => {
    const template = `foo

<%= "foo".toUpperCase() %>

<%== "foo".length %>
`;

    const baseline = compileJs(template);
    const erubi = compileJs(template, { bufvar: "boofer" } as never);

    expect(erubi.code).toBe(baseline.code.replaceAll("outputBuffer", "boofer"));
  });
});
