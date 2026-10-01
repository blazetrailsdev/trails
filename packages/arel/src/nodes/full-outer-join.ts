import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class FullOuterJoin extends Join {}

rbSetClassPathString(FullOuterJoin, Nodes, "FullOuterJoin");
Nodes.FullOuterJoin = FullOuterJoin;
