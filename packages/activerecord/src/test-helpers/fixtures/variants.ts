import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/variants.yml
export const variantFixtureData = {
  variant_1: {
    id: 1,
    product_id: ref("products", "product_1"),
    name: "Variant",
  },
};
