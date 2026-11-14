import { TopLevel, include, type Extended } from "@blazetrails/ruby-compat";

type Namespace = { [name: string]: unknown };
type Format2 = NonNullable<typeof TopLevel.TZInfo>["Format2"];

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
const Definitions = (Data.Definitions ??= {}) as Namespace;
const Etc = (Definitions.Etc ??= {}) as Namespace;
const GMT__p__1 = (Etc.GMT__p__1 ??= {}) as Namespace;
include(GMT__p__1, TZInfo.Format2.TimezoneDefinition);
(GMT__p__1 as unknown as Extended<Format2["TimezoneDefinition"]["ClassMethods"]>).timezone(
  "Etc/GMT+1",
  (tz) => {
    tz.offset("o0", -3600, 0, "-01");
  },
);
