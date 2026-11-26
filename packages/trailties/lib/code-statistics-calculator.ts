import { File, getFs, StringIO } from "@blazetrails/ruby-compat";

export type FileType =
  | "rb"
  | "tse"
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
  tse: { lineComment: /((^\s*<%#.*%>)|(<!--.*-->))/ },
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

  add(codeStatisticsCalculator: CodeStatisticsCalculator): void {
    this.lines += codeStatisticsCalculator.lines;
    this.codeLines += codeStatisticsCalculator.codeLines;
    this.classes += codeStatisticsCalculator.classes;
    this.methods += codeStatisticsCalculator.methods;
  }

  async addByFilePath(filePath: string): Promise<void> {
    const f = new StringIO(await getFs().readFile(filePath, "utf-8"));
    this.addByIo(f, this.fileType(filePath));
  }

  addByIo(io: { gets(): string | null }, fileType: string): void {
    const patterns: PatternSet = PATTERNS[fileType as FileType] ?? {};

    let commentStarted = false;

    let line: string | null;
    while ((line = io.gets()) != null) {
      this.lines += 1;

      if (commentStarted) {
        if (patterns.endBlockComment && patterns.endBlockComment.test(line)) {
          commentStarted = false;
        }
        continue;
      } else {
        if (patterns.beginBlockComment && patterns.beginBlockComment.test(line)) {
          commentStarted = true;
          continue;
        }
      }

      if (patterns.class && patterns.class.test(line)) this.classes += 1;
      if (patterns.method && patterns.method.test(line)) this.methods += 1;
      if (
        !/^\s*$/.test(line) &&
        (patterns.lineComment == null || !patterns.lineComment.test(line))
      ) {
        this.codeLines += 1;
      }
    }
  }

  /** @internal */
  private fileType(filePath: string): string {
    if (filePath.endsWith("_test.rb")) {
      return "minitest";
    } else {
      return File.extname(filePath).replace(/^\./, "").toLowerCase();
    }
  }
}
