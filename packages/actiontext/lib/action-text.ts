import { Autoload, extend, type Deprecation, type Extended } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {};

export const ActionText = { name: "ActionText", loadPath } as AutoloadModule & {
  deprecator(): Deprecation;
};
extend(ActionText, Autoload);
constSet(TopLevel, "ActionText", ActionText);
