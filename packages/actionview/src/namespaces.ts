import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_view/base": () => import("./base.js"),
};

export const ActionView = { name: "ActionView", loadPath } as AutoloadModule & {
  Base: typeof Base;
};
extend(ActionView, Autoload);
ActionView.eagerAutoload(() => {
  ActionView.autoload("Base");
});
