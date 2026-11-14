import { TopLevel, include, type Extended } from "@blazetrails/ruby-compat";

type Namespace = { [name: string]: unknown };
type Format2 = NonNullable<typeof TopLevel.TZInfo>["Format2"];

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
const Definitions = (Data.Definitions ??= {}) as Namespace;
const InvalidX = (Definitions.InvalidX ??= {}) as Namespace;
const Incorrect_ModuleX = (InvalidX.Incorrect_ModuleX ??= {}) as Namespace;
include(Incorrect_ModuleX, TZInfo.Format2.TimezoneDefinition);
(Incorrect_ModuleX as unknown as Extended<Format2["TimezoneDefinition"]["ClassMethods"]>).timezone(
  "Invalid/Incorrect_Module",
  (tz) => {
    tz.offset("o0", 0, 0, "UTC");
  },
);
