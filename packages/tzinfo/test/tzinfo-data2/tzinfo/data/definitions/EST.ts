import { TopLevel, include, type Extended } from "@blazetrails/ruby-compat";

type Namespace = { [name: string]: unknown };
type Format2 = NonNullable<typeof TopLevel.TZInfo>["Format2"];

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
const Definitions = (Data.Definitions ??= {}) as Namespace;
const EST = (Definitions.EST ??= {}) as Namespace;
include(EST, TZInfo.Format2.TimezoneDefinition);
(EST as unknown as Extended<Format2["TimezoneDefinition"]["ClassMethods"]>).timezone(
  "EST",
  (tz) => {
    tz.offset("o0", -18000, 0, "EST");
  },
);
