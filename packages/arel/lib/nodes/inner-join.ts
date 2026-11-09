import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class InnerJoin extends Join {}

constSet(Nodes, "InnerJoin", InnerJoin);
