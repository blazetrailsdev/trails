import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class RightOuterJoin extends Join {}

rbModConstSet(Nodes, "RightOuterJoin", RightOuterJoin);
