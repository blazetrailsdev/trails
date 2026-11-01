import { Nodes } from "../namespaces.js";
import { constSet } from "@blazetrails/ruby-compat";
import { Join } from "./binary.js";

export class OuterJoin extends Join {}

constSet(Nodes, "OuterJoin", OuterJoin);
