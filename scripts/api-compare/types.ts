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
}

export interface ApiManifest {
  source: "ruby" | "typescript";
  generatedAt: string;
  packages: Record<string, PackageInfo>;
}

// --- Comparison results ---

export type MethodStatus = "matched" | "missing" | "extra" | "signature_mismatch";

export interface MethodComparison {
  rubyName: string;
  tsName: string | null;
  status: MethodStatus;
  rubyParams?: ParamInfo[];
  tsParams?: ParamInfo[];
  notes?: string;
}

export interface ClassComparison {
  rubyClass: string;
  tsClass: string;
  package: string;
  instanceMethods: MethodComparison[];
  classMethods: MethodComparison[];
  coveragePercent: number;
  matched: number;
  missing: number;
  extra: number;
  signatureMismatch: number;
}

export interface ComparisonResult {
  generatedAt: string;
  railsVersion: string;
  summary: {
    totalRubyMethods: number;
    matched: number;
    missing: number;
    extra: number;
    signatureMismatch: number;
    coveragePercent: number;
  };
  packages: Record<string, ClassComparison[]>;
}
