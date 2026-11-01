import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class FullOuterJoin extends Join {}

constSet(Nodes, "FullOuterJoin", FullOuterJoin);
