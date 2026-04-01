// Shared types for API comparison pipeline

// --- Extracted API manifest ---

export interface ParamInfo {
  name: string;
  kind: "required" | "optional" | "rest" | "keyword" | "keyword_rest" | "block";
  default?: string;
}

export interface MethodInfo {
  name: string;
  visibility: "public" | "protected" | "private";
  params: ParamInfo[];
  line?: number;
  file?: string;
  isStatic?: boolean;
}

export interface ClassInfo {
  name: string;
  superclass?: string;
  file?: string;
  includes: string[];
  extends: string[];
  instanceMethods: MethodInfo[];
  classMethods: MethodInfo[];
}

export interface PackageInfo {
  classes: Record<string, ClassInfo>;
  modules: Record<string, ClassInfo>;
  fileFunctions?: Record<string, MethodInfo[]>;
}

export interface ApiManifest {
  source: "ruby" | "typescript";
  generatedAt: string;
  packages: Record<string, PackageInfo>;
}
