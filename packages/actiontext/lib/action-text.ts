import { Autoload, extend, type Deprecation, type Extended } from "@blazetrails/activesupport";
import { TopLevel, constSet, type Gem } from "@blazetrails/ruby-compat";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {};

export const ActionText = { name: "ActionText", loadPath } as AutoloadModule & {
  deprecator(): Deprecation;
  version(): InstanceType<typeof Gem.Version>;
  gemVersion(): InstanceType<typeof Gem.Version>;
};
extend(ActionText, Autoload);
constSet(TopLevel, "ActionText", ActionText);
