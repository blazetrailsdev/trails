export { virtualize, remapLine } from "./virtualize.js";
export type { VirtualizeResult, VirtualizeOptions, LineDelta } from "./virtualize.js";
export type { WalkOptions } from "./walker.js";
export { walk } from "./walker.js";
export type {
  ClassInfo,
  RuntimeCall,
  AttributeCall,
  AssociationCall,
  AssociationKind,
  ScopeCall,
  EnumCall,
  DefineEnumCall,
} from "./walker.js";
export { synthesizeDeclares } from "./synthesize.js";
export { ATTRIBUTE_TYPE_MAP, tsTypeFor } from "./type-registry.js";
