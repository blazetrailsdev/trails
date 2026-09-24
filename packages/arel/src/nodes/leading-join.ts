import { Nodes } from "../namespaces.js";
import { InnerJoin } from "./inner-join.js";

export class LeadingJoin extends InnerJoin {}

Nodes.LeadingJoin = LeadingJoin;
