import { describe, expect, it } from "vitest";

import { SafeList } from "./safelist.js";

describe("Html5TestSafelistProperties", () => {
  for (const attrName of SafeList.SVG_ATTR_VAL_ALLOWS_REF) {
    it(`test_svg_attr_allow_ref_${attrName}_is_in_svg_attributes`, () => {
      expect(SafeList.SVG_ATTRIBUTES).toContain(attrName);
    });
  }

  for (const attrName of SafeList.SVG_ALLOW_LOCAL_HREF) {
    it(`test_svg_attr_allow_local_ref_${attrName}_is_in_svg_elements`, () => {
      expect(SafeList.SVG_ELEMENTS).toContain(attrName);
    });
  }
});
