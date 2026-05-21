import { ref } from "../define-fixtures.js";

// activerecord/test/fixtures/price_estimates.yml
// `estimate_of: <row> (<Type>)` is Rails' polymorphic shorthand → estimate_of_id
// + estimate_of_type pair. `honda` uses Rails' numeric-FK form (estimate_of_id: 1,
// estimate_of_type: Car) → ref to cars.honda.
export const priceEstimateFixtureData = {
  sapphire_1: {
    price: 10,
    estimate_of_id: ref("treasures", "sapphire"),
    estimate_of_type: "Treasure",
  },
  sapphire_2: {
    price: 20,
    estimate_of_id: ref("treasures", "sapphire"),
    estimate_of_type: "Treasure",
  },
  diamond: {
    price: 30,
    estimate_of_id: ref("treasures", "diamond"),
    estimate_of_type: "Treasure",
  },
  honda: {
    price: 40,
    estimate_of_type: "Car",
    estimate_of_id: ref("cars", "honda"),
  },
};
