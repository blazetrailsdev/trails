import { describe, expect, it } from "vitest";
import { htmlSafe } from "@blazetrails/activesupport";

import { OutputBuffer } from "../../lib/buffers.js";
import { OutputFlow } from "../../lib/flows.js";
import { concat } from "../../lib/helpers/text-helper.js";
import { javascriptTag } from "../../lib/helpers/javascript-helper.js";

describe("JavaScriptHelperTest", () => {
  it("javascript tag with block", () => {
    const ctx = {
      outputBuffer: new OutputBuffer(),
      viewFlow: new OutputFlow(),
      contentSecurityPolicyNonce: () => null,
    };
    const result = javascriptTag
      .call(ctx, { type: "application/javascript" }, undefined, () => {
        concat.call(ctx, htmlSafe("alert('hello')"));
      })
      .toString();
    expect(result).toBe(
      "<script type=\"application/javascript\">\n//<![CDATA[\nalert('hello')\n//]]>\n</script>",
    );
  });
});
