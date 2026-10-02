import { Nodes } from "../namespaces.js";
import { include } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Binary } from "./binary.js";
import { WindowPredications, type WindowPredicationsModule } from "../window-predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Filter extends Binary {}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type,
   @typescript-eslint/no-unsafe-declaration-merging */
export interface Filter extends WindowPredicationsModule, AliasPredicationModule {}

include(Filter, WindowPredications);
include(Filter, AliasPredication);

rbModConstSet(Nodes, "Filter", Filter);
