/**
 * Port of railties/lib/rails/code_statistics_calculator.rb.
 *
 * Counts lines/codeLines/classes/methods in source text by file type.
 * Patterns mirror Rails' for rb/erb/css/scss/js/coffee; ts/tsx add TS
 * equivalents (function, arrow, class method shorthand with leading
 * keyword, get/set accessors).
 */

export type FileType =
  | "rb"
  | "erb"
  | "css"
  | "scss"
  | "js"
  | "ts"
  | "tsx"
  | "coffee"
  | "rake"
  | "minitest";

interface PatternSet {
  lineComment?: RegExp;
  beginBlockComment?: RegExp;
  endBlockComment?: RegExp;
  class?: RegExp;
  method?: RegExp;
}

const TS_METHOD =
  /(\bfunction\b(\s+[_a-zA-Z][\w]*)?\s*\()|(\b(async|get|set|public|private|protected|static)\b\s+[_a-zA-Z][\w]*\s*\()|(=\s*(async\s+)?(\([^)]*\)|[_a-zA-Z][\w]*)\s*=>)/;
const TS_CLASS = /^\s*(export\s+)?(default\s+)?(abstract\s+)?class\s+[_A-Z]/;
const TS_BLOCK: PatternSet = {
  lineComment: /^\s*\/\//,
  beginBlockComment: /^\s*\/\*/,
  endBlockComment: /\*\//,
  class: TS_CLASS,
  method: TS_METHOD,
};
const RB: PatternSet = {
  lineComment: /^\s*#/,
  beginBlockComment: /^=begin/,
  endBlockComment: /^=end/,
  class: /^\s*class\s+[_A-Z]/,
  method: /^\s*def\s+[_a-z]/,
};

export const PATTERNS: Record<FileType, PatternSet> = {
  rb: RB,
  rake: RB,
  minitest: { ...RB, method: /^\s*(def|test)\s+['"_a-z]/ },
  erb: { lineComment: /((^\s*<%#.*%>)|(<!--.*-->))/ },
  css: { lineComment: /^\s*\/\*.*\*\// },
  scss: { lineComment: /((^\s*\/\*.*\*\/)|(^\s*\/\/))/ },
  js: {
    lineComment: /^\s*\/\//,
    beginBlockComment: /^\s*\/\*/,
    endBlockComment: /\*\//,
    method: /function(\s+[_a-zA-Z][\da-zA-Z]*)?\s*\(/,
  },
  ts: TS_BLOCK,
  tsx: TS_BLOCK,
  coffee: {
    lineComment: /^\s*#/,
    beginBlockComment: /^\s*###/,
    endBlockComment: /^\s*###/,
    class: /^\s*class\s+[_A-Z]/,
    method: /[-=]>/,
  },
};

export class CodeStatisticsCalculator {
  constructor(
    public lines = 0,
    public codeLines = 0,
    public classes = 0,
    public methods = 0,
  ) {}

  add(other: CodeStatisticsCalculator): void {
    this.lines += other.lines;
    this.codeLines += other.codeLines;
    this.classes += other.classes;
    this.methods += other.methods;
  }

  async addByFilePath(filePath: string, readFile: (p: string) => Promise<string>): Promise<void> {
    this.addByString(await readFile(filePath), fileType(filePath));
  }

  addByString(content: string, type: FileType | undefined): void {
    const patterns = (type && PATTERNS[type]) || {};
    let commentStarted = false;
    const lines = content.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

    for (const line of lines) {
      this.lines += 1;
      if (commentStarted) {
        if (patterns.endBlockComment?.test(line)) commentStarted = false;
        continue;
      }
      if (patterns.beginBlockComment?.test(line)) {
        commentStarted = true;
        continue;
      }
      if (patterns.class?.test(line)) this.classes += 1;
      if (patterns.method?.test(line)) this.methods += 1;
      if (!/^\s*$/.test(line) && (!patterns.lineComment || !patterns.lineComment.test(line))) {
        this.codeLines += 1;
      }
    }
  }
}

export function fileType(filePath: string): FileType | undefined {
  if (filePath.endsWith("_test.rb")) return "minitest";
  const m = /\.([^.]+)$/.exec(filePath);
  if (!m) return undefined;
  const ext = m[1].toLowerCase() as FileType;
  return ext in PATTERNS ? ext : undefined;
}
