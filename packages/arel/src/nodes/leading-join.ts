import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { InnerJoin } from "./inner-join.js";

export class LeadingJoin extends InnerJoin {}

rbModConstSet(Nodes, "LeadingJoin", LeadingJoin);
