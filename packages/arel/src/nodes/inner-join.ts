import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class InnerJoin extends Join {}

rbSetClassPathString(InnerJoin, Nodes, "InnerJoin");
Nodes.InnerJoin = InnerJoin;
