import { Autoload, extend, TopLevel, type Extended } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import type { FileSystemResolver } from "./template/resolver.js";
import type { Select } from "./helpers/tags/select.js";
import type { CollectionCheckBoxes } from "./helpers/tags/collection-check-boxes.js";
import type { CollectionRadioButtons } from "./helpers/tags/collection-radio-buttons.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_view/base": () => import("./base.js"),
};

export const ActionView = { name: "ActionView", loadPath } as AutoloadModule & {
  Base: typeof Base;
  FileSystemResolver: typeof FileSystemResolver;
};
extend(ActionView, Autoload);
ActionView.eagerAutoload(() => {
  ActionView.autoload("Base");
});

TopLevel.ActionView = ActionView;

export const Tags = { name: "ActionView::Helpers::Tags" } as {
  name: string;
  Select: typeof Select;
  CollectionCheckBoxes: typeof CollectionCheckBoxes;
  CollectionRadioButtons: typeof CollectionRadioButtons;
};
