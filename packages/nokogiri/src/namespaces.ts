import type { Node } from "./html5/node.js";
import type { NodeSet } from "./xml/node-set.js";

export const XML = { name: "Nokogiri::XML" } as { name: string; NodeSet: typeof NodeSet };

export const HTML5 = { name: "Nokogiri::HTML5" } as { name: string; Node: typeof Node };
