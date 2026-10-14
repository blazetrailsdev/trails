import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class InnerJoin extends Join {}

rbModConstSet(Nodes, "InnerJoin", InnerJoin);
