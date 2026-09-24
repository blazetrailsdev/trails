import { Nodes } from "../namespaces.js";
import { Join } from "./binary.js";

export class RightOuterJoin extends Join {}

Nodes.RightOuterJoin = RightOuterJoin;
