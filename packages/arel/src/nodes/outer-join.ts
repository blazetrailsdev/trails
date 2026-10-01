import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class OuterJoin extends Join {}

rbSetClassPathString(OuterJoin, Nodes, "OuterJoin");
Nodes.OuterJoin = OuterJoin;
