import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class FullOuterJoin extends Join {}

rbModConstSet(Nodes, "FullOuterJoin", FullOuterJoin);
