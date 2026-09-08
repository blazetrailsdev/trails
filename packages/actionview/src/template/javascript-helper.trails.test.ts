import { describe, expect, it } from "vitest";
import { htmlSafe } from "@blazetrails/activesupport";

import { OutputBuffer } from "../buffers.js";
import { OutputFlow } from "../flows.js";
import { concat } from "../helpers/text-helper.js";
import { javascriptTag } from "../helpers/javascript-helper.js";

describe("JavaScriptHelperTest", () => {
  it("javascript tag with block", () => {
    const ctx = { outputBuffer: new OutputBuffer(), viewFlow: new OutputFlow() };
    const result = javascriptTag
      .call(ctx, { type: "application/javascript" }, () => {
        concat.call(ctx, htmlSafe("alert('hello')"));
      })
      .toString();
    expect(result).toBe(
      "<script type=\"application/javascript\">\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
    );
  });
});
