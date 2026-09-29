import { Coder } from "@blazetrails/activesupport/yaml";
import { RuntimeError } from "@blazetrails/ruby-compat";

export const LegacyYamlAdapter = {
  convert<T>(coder: T): T {
    if (!(coder instanceof Coder)) return coder;

    switch (coder["active_record_yaml_version"]) {
      case 1:
      case 2:
        return coder;
      default:
        throw new RuntimeError("Active Record doesn't know how to load YAML with this format.");
    }
  },
};
