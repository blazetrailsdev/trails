import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { InnerJoin } from "./inner-join.js";

export class LeadingJoin extends InnerJoin {}

rbSetClassPathString(LeadingJoin, Nodes, "LeadingJoin");
Nodes.LeadingJoin = LeadingJoin;
