import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class OuterJoin extends Join {}

rbModConstSet(Nodes, "OuterJoin", OuterJoin);
