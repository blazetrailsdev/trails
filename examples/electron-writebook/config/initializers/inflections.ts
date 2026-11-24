import { inflections } from "@blazetrails/activesupport";

inflections("en", (inflect) => {
  inflect.irregular("leaf", "leaves");
});
