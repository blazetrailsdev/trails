import { extend, type Extended } from "@blazetrails/ruby-compat";
import * as Autoload from "../../dependencies/autoload.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "fixtures/autoload/some_class": () => import("./some-class.js"),
  "fixtures/autoload/another_class": () => import("./another-class.js"),
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
