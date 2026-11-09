import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class RightOuterJoin extends Join {}

constSet(Nodes, "RightOuterJoin", RightOuterJoin);
