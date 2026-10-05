import { bench, describe } from "vitest";
import { Builder } from "./builder.js";
import { IntegerType } from "../type/integer.js";
import { StringType } from "../type/string.js";

const types = { id: new IntegerType(), priority: new IntegerType(), title: new StringType() };
const builder = new Builder(types);
const records = Array.from({ length: 1000 }, (_, i) =>
  builder.buildFromDatabase({ id: String(i), priority: String(i % 5), title: `story ${i}` }),
);
for (const attributes of records) attributes.fetchValue("id");
const materialized = records.map((_, i) =>
  builder.buildFromDatabase({ id: String(i), priority: String(i % 5), title: `story ${i}` }),
);
for (const attributes of materialized) {
  attributes.keys();
  attributes.fetchValue("id");
}

describe("LazyAttributeSet#fetch_value hot path", () => {
  bench("100,000 reads of a cast attribute", () => {
    for (let n = 0; n < 100; n++) {
      for (const attributes of records) void attributes.fetchValue("id");
    }
  });

  bench("100,000 reads of a materialized attribute", () => {
    for (let n = 0; n < 100; n++) {
      for (const attributes of materialized) void attributes.fetchValue("id");
    }
  });

  bench("build_from_database and first read of each attribute", () => {
    const attributes = builder.buildFromDatabase({ id: "1", priority: "2", title: "story" });
    void attributes.fetchValue("id");
    void attributes.fetchValue("priority");
    void attributes.fetchValue("title");
  });
});
