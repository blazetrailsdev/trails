import { Autoload, extend, TopLevel, type Extended } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import type { FileSystemResolver } from "./template/resolver.js";
import type { Template } from "./template.js";
import type { SelectRenderer } from "./helpers/tags/select-renderer.js";
import type { Base as TagsBase } from "./helpers/tags/base.js";
import type { Translator } from "./helpers/tags/translator.js";
import type { CheckBox } from "./helpers/tags/check-box.js";
import type { CollectionCheckBoxes } from "./helpers/tags/collection-check-boxes.js";
import type { CollectionRadioButtons } from "./helpers/tags/collection-radio-buttons.js";
import type { CollectionSelect } from "./helpers/tags/collection-select.js";
import type { ColorField } from "./helpers/tags/color-field.js";
import type { DateField } from "./helpers/tags/date-field.js";
import type { DateSelect } from "./helpers/tags/date-select.js";
import type { DatetimeField } from "./helpers/tags/datetime-field.js";
import type { DatetimeLocalField } from "./helpers/tags/datetime-local-field.js";
import type { DatetimeSelect } from "./helpers/tags/datetime-select.js";
import type { EmailField } from "./helpers/tags/email-field.js";
import type { FileField } from "./helpers/tags/file-field.js";
import type { GroupedCollectionSelect } from "./helpers/tags/grouped-collection-select.js";
import type { HiddenField } from "./helpers/tags/hidden-field.js";
import type { Label } from "./helpers/tags/label.js";
import type { MonthField } from "./helpers/tags/month-field.js";
import type { NumberField } from "./helpers/tags/number-field.js";
import type { PasswordField } from "./helpers/tags/password-field.js";
import type { RadioButton } from "./helpers/tags/radio-button.js";
import type { RangeField } from "./helpers/tags/range-field.js";
import type { SearchField } from "./helpers/tags/search-field.js";
import type { Select } from "./helpers/tags/select.js";
import type { TelField } from "./helpers/tags/tel-field.js";
import type { TextArea } from "./helpers/tags/text-area.js";
import type { TextField } from "./helpers/tags/text-field.js";
import type { TimeField } from "./helpers/tags/time-field.js";
import type { TimeSelect } from "./helpers/tags/time-select.js";
import type { TimeZoneSelect } from "./helpers/tags/time-zone-select.js";
import type { UrlField } from "./helpers/tags/url-field.js";
import type { WeekField } from "./helpers/tags/week-field.js";
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
  "action_view/helpers/tags/select_renderer": () => import("./helpers/tags/select-renderer.js"),
  "action_view/helpers/tags/base": () => import("./helpers/tags/base.js"),
  "action_view/helpers/tags/translator": () => import("./helpers/tags/translator.js"),
  "action_view/helpers/tags/check_box": () => import("./helpers/tags/check-box.js"),
  "action_view/helpers/tags/collection_check_boxes": () =>
    import("./helpers/tags/collection-check-boxes.js"),
  "action_view/helpers/tags/collection_radio_buttons": () =>
    import("./helpers/tags/collection-radio-buttons.js"),
  "action_view/helpers/tags/collection_select": () => import("./helpers/tags/collection-select.js"),
  "action_view/helpers/tags/color_field": () => import("./helpers/tags/color-field.js"),
  "action_view/helpers/tags/date_field": () => import("./helpers/tags/date-field.js"),
  "action_view/helpers/tags/date_select": () => import("./helpers/tags/date-select.js"),
  "action_view/helpers/tags/datetime_field": () => import("./helpers/tags/datetime-field.js"),
  "action_view/helpers/tags/datetime_local_field": () =>
    import("./helpers/tags/datetime-local-field.js"),
  "action_view/helpers/tags/datetime_select": () => import("./helpers/tags/datetime-select.js"),
  "action_view/helpers/tags/email_field": () => import("./helpers/tags/email-field.js"),
  "action_view/helpers/tags/file_field": () => import("./helpers/tags/file-field.js"),
  "action_view/helpers/tags/grouped_collection_select": () =>
    import("./helpers/tags/grouped-collection-select.js"),
  "action_view/helpers/tags/hidden_field": () => import("./helpers/tags/hidden-field.js"),
  "action_view/helpers/tags/label": () => import("./helpers/tags/label.js"),
  "action_view/helpers/tags/month_field": () => import("./helpers/tags/month-field.js"),
  "action_view/helpers/tags/number_field": () => import("./helpers/tags/number-field.js"),
  "action_view/helpers/tags/password_field": () => import("./helpers/tags/password-field.js"),
  "action_view/helpers/tags/radio_button": () => import("./helpers/tags/radio-button.js"),
  "action_view/helpers/tags/range_field": () => import("./helpers/tags/range-field.js"),
  "action_view/helpers/tags/search_field": () => import("./helpers/tags/search-field.js"),
  "action_view/helpers/tags/select": () => import("./helpers/tags/select.js"),
  "action_view/helpers/tags/tel_field": () => import("./helpers/tags/tel-field.js"),
  "action_view/helpers/tags/text_area": () => import("./helpers/tags/text-area.js"),
  "action_view/helpers/tags/text_field": () => import("./helpers/tags/text-field.js"),
  "action_view/helpers/tags/time_field": () => import("./helpers/tags/time-field.js"),
  "action_view/helpers/tags/time_select": () => import("./helpers/tags/time-select.js"),
  "action_view/helpers/tags/time_zone_select": () => import("./helpers/tags/time-zone-select.js"),
  "action_view/helpers/tags/url_field": () => import("./helpers/tags/url-field.js"),
  "action_view/helpers/tags/week_field": () => import("./helpers/tags/week-field.js"),
  "action_view/helpers/tags/weekday_select": () => import("./helpers/tags/weekday-select.js"),
};

export const Tags = {
  name: "ActionView::Helpers::Tags",
  loadPath: tagsLoadPath,
} as AutoloadModule & {
  SelectRenderer: typeof SelectRenderer;
  Base: typeof TagsBase;
  Translator: typeof Translator;
  CheckBox: typeof CheckBox;
  CollectionCheckBoxes: typeof CollectionCheckBoxes;
  CollectionRadioButtons: typeof CollectionRadioButtons;
  CollectionSelect: typeof CollectionSelect;
  ColorField: typeof ColorField;
  DateField: typeof DateField;
  DateSelect: typeof DateSelect;
  DatetimeField: typeof DatetimeField;
  DatetimeLocalField: typeof DatetimeLocalField;
  DatetimeSelect: typeof DatetimeSelect;
  EmailField: typeof EmailField;
  FileField: typeof FileField;
  GroupedCollectionSelect: typeof GroupedCollectionSelect;
  HiddenField: typeof HiddenField;
  Label: typeof Label;
  MonthField: typeof MonthField;
  NumberField: typeof NumberField;
  PasswordField: typeof PasswordField;
  RadioButton: typeof RadioButton;
  RangeField: typeof RangeField;
  SearchField: typeof SearchField;
  Select: typeof Select;
  TelField: typeof TelField;
  TextArea: typeof TextArea;
  TextField: typeof TextField;
  TimeField: typeof TimeField;
  TimeSelect: typeof TimeSelect;
  TimeZoneSelect: typeof TimeZoneSelect;
  UrlField: typeof UrlField;
  WeekField: typeof WeekField;
  WeekdaySelect: typeof WeekdaySelect;
};
extend(Tags, Autoload);
Tags.autoload("SelectRenderer");
Tags.eagerAutoload(() => {
  Tags.autoload("Base");
  Tags.autoload("Translator");
  Tags.autoload("CheckBox");
  Tags.autoload("CollectionCheckBoxes");
  Tags.autoload("CollectionRadioButtons");
  Tags.autoload("CollectionSelect");
  Tags.autoload("ColorField");
  Tags.autoload("DateField");
  Tags.autoload("DateSelect");
  Tags.autoload("DatetimeField");
  Tags.autoload("DatetimeLocalField");
  Tags.autoload("DatetimeSelect");
  Tags.autoload("EmailField");
  Tags.autoload("FileField");
  Tags.autoload("GroupedCollectionSelect");
  Tags.autoload("HiddenField");
  Tags.autoload("Label");
  Tags.autoload("MonthField");
  Tags.autoload("NumberField");
  Tags.autoload("PasswordField");
  Tags.autoload("RadioButton");
  Tags.autoload("RangeField");
  Tags.autoload("SearchField");
  Tags.autoload("Select");
  Tags.autoload("TelField");
  Tags.autoload("TextArea");
  Tags.autoload("TextField");
  Tags.autoload("TimeField");
  Tags.autoload("TimeSelect");
  Tags.autoload("TimeZoneSelect");
  Tags.autoload("UrlField");
  Tags.autoload("WeekField");
  Tags.autoload("WeekdaySelect");
});
