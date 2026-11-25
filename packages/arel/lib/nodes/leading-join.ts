import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat/include";
import { InnerJoin } from "./inner-join.js";

export class LeadingJoin extends InnerJoin {}

constSet(Nodes, "LeadingJoin", LeadingJoin);
