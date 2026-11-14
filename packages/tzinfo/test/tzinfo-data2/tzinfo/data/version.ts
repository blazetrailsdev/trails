import { TopLevel } from "@blazetrails/ruby-compat";

type Namespace = { [name: string]: unknown };

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
Data.VERSION = "2.2020.4.test";
const Version = (Data.Version ??= {}) as Namespace;
Version.FORMAT = 2;
Version.STRING = Data.VERSION;
Version.TZDATA = "2020d";
