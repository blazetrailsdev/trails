import { TopLevel } from "@blazetrails/ruby-compat";
import "./data/version.js";

type Namespace = { [name: string]: unknown };

const TZInfo = TopLevel.TZInfo! as NonNullable<typeof TopLevel.TZInfo> & Namespace;
const Data = (TZInfo.Data ??= {}) as Namespace;
Data.LOCATION = "tzinfo-data2";
