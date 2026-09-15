import { extend, type Extended } from "@blazetrails/ruby-compat";
import * as Autoload from "../../dependencies/autoload.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const FixturesAutoload = { name: "Fixtures::Autoload" } as AutoloadModule & { SomeClass?: unknown };
extend(FixturesAutoload, Autoload);

export const Fixtures = { name: "Fixtures", Autoload: FixturesAutoload } as AutoloadModule & {
  Autoload: typeof FixturesAutoload;
  AnotherClass?: unknown;
};
extend(Fixtures, Autoload);
