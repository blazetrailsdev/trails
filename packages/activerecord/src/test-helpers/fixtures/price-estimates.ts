import { ref } from "../../fixtures.js";

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
