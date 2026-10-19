import { Autoload, extend, TopLevel, type Extended } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import type { FileSystemResolver } from "./template/resolver.js";
import type { Template } from "./template.js";
import type { Select } from "./helpers/tags/select.js";
import type { CollectionCheckBoxes } from "./helpers/tags/collection-check-boxes.js";
import type { CollectionRadioButtons } from "./helpers/tags/collection-radio-buttons.js";
import type { CollectionSelect } from "./helpers/tags/collection-select.js";
import type { GroupedCollectionSelect } from "./helpers/tags/grouped-collection-select.js";
import type { DateSelect } from "./helpers/tags/date-select.js";
import type { DatetimeSelect } from "./helpers/tags/datetime-select.js";
import type { TimeSelect } from "./helpers/tags/time-select.js";
import type { TimeZoneSelect } from "./helpers/tags/time-zone-select.js";
import type { WeekdaySelect } from "./helpers/tags/weekday-select.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_view/base": () => import("./base.js"),
};

export const ActionView = { name: "ActionView", loadPath } as AutoloadModule & {
  Base: typeof Base;
  FileSystemResolver: typeof FileSystemResolver;
  Template: typeof Template;
};
extend(ActionView, Autoload);
ActionView.eagerAutoload(() => {
  ActionView.autoload("Base");
});

TopLevel.ActionView = ActionView;

const tagsLoadPath: Record<string, () => Promise<unknown>> = {
  "action_view/helpers/tags/collection_check_boxes": () =>
    import("./helpers/tags/collection-check-boxes.js"),
  "action_view/helpers/tags/collection_radio_buttons": () =>
    import("./helpers/tags/collection-radio-buttons.js"),
  "action_view/helpers/tags/collection_select": () => import("./helpers/tags/collection-select.js"),
  "action_view/helpers/tags/date_select": () => import("./helpers/tags/date-select.js"),
  "action_view/helpers/tags/datetime_select": () => import("./helpers/tags/datetime-select.js"),
  "action_view/helpers/tags/grouped_collection_select": () =>
    import("./helpers/tags/grouped-collection-select.js"),
  "action_view/helpers/tags/select": () => import("./helpers/tags/select.js"),
  "action_view/helpers/tags/time_select": () => import("./helpers/tags/time-select.js"),
  "action_view/helpers/tags/time_zone_select": () => import("./helpers/tags/time-zone-select.js"),
  "action_view/helpers/tags/weekday_select": () => import("./helpers/tags/weekday-select.js"),
};

export const Tags = {
  name: "ActionView::Helpers::Tags",
  loadPath: tagsLoadPath,
} as AutoloadModule & {
  Select: typeof Select;
  CollectionCheckBoxes: typeof CollectionCheckBoxes;
  CollectionRadioButtons: typeof CollectionRadioButtons;
  CollectionSelect: typeof CollectionSelect;
  GroupedCollectionSelect: typeof GroupedCollectionSelect;
  DateSelect: typeof DateSelect;
  DatetimeSelect: typeof DatetimeSelect;
  TimeSelect: typeof TimeSelect;
  TimeZoneSelect: typeof TimeZoneSelect;
  WeekdaySelect: typeof WeekdaySelect;
};
extend(Tags, Autoload);
Tags.eagerAutoload(() => {
  Tags.autoload("CollectionCheckBoxes");
  Tags.autoload("CollectionRadioButtons");
  Tags.autoload("CollectionSelect");
  Tags.autoload("DateSelect");
  Tags.autoload("DatetimeSelect");
  Tags.autoload("GroupedCollectionSelect");
  Tags.autoload("Select");
  Tags.autoload("TimeSelect");
  Tags.autoload("TimeZoneSelect");
  Tags.autoload("WeekdaySelect");
});
