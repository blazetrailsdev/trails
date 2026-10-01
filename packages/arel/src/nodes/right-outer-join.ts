import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class RightOuterJoin extends Join {}

rbSetClassPathString(RightOuterJoin, Nodes, "RightOuterJoin");
Nodes.RightOuterJoin = RightOuterJoin;
