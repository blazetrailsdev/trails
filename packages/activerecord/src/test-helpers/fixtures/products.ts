import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/products.yml
export const productFixtureData = {
  product_1: {
    id: 1,
    collection_id: ref("collections", "collection_1"),
    name: "Product",
  },
};
