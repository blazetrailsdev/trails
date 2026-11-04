import { YAML } from "@blazetrails/ruby-compat/yaml";

console.log("typeof YAML =", typeof YAML);
console.log("has loadTags =", YAML != null && "loadTags" in (YAML as object));
