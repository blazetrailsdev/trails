import { TopLevel, include, type Extended } from "@blazetrails/ruby-compat";

type Namespace = { [name: string]: unknown };
type Format2 = NonNullable<typeof TopLevel.TZInfo>["Format2"];

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
const Definitions = (Data.Definitions ??= {}) as Namespace;
const Etc = (Definitions.Etc ??= {}) as Namespace;
const UTC = (Etc.UTC ??= {}) as Namespace;
include(UTC, TZInfo.Format2.TimezoneDefinition);
(UTC as unknown as Extended<Format2["TimezoneDefinition"]["ClassMethods"]>).timezone(
  "Etc/UTC",
  (tz) => {
    tz.offset("o0", 0, 0, "UTC");
  },
);
