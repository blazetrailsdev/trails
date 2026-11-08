import { extend, type Extended } from "@blazetrails/ruby-compat";
import * as Autoload from "../../dependencies/autoload.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const LOADED_FEATURES: string[] = [];

const loadPath: Record<string, () => Promise<unknown>> = {
  "fixtures/autoload/some_class": async () => {
    LOADED_FEATURES.push("fixtures/autoload/some_class");
    return import("./some-class.js");
  },
  "fixtures/autoload/another_class": async () => {
    LOADED_FEATURES.push("fixtures/autoload/another_class");
    return import("./another-class.js");
  },
};

const FixturesAutoload = { name: "Fixtures::Autoload", loadPath } as AutoloadModule & {
  SomeClass?: unknown;
};
extend(FixturesAutoload, Autoload);

export const Fixtures = {
  name: "Fixtures",
  loadPath,
  Autoload: FixturesAutoload,
} as AutoloadModule & {
  Autoload: typeof FixturesAutoload;
  AnotherClass?: unknown;
};
extend(Fixtures, Autoload);
