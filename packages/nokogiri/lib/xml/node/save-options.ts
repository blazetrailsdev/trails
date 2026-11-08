export class SaveOptions {
  static readonly FORMAT = 1;
  static readonly NO_DECLARATION = 2;
  static readonly NO_EMPTY_TAGS = 4;
  static readonly NO_XHTML = 8;
  static readonly AS_XHTML = 16;
  static readonly AS_XML = 32;
  static readonly AS_HTML = 64;

  static readonly DEFAULT_XML = SaveOptions.FORMAT | SaveOptions.AS_XML;
  static readonly DEFAULT_HTML =
    SaveOptions.FORMAT |
    SaveOptions.NO_DECLARATION |
    SaveOptions.NO_EMPTY_TAGS |
    SaveOptions.AS_HTML;
  static readonly DEFAULT_XHTML =
    SaveOptions.FORMAT | SaveOptions.NO_DECLARATION | SaveOptions.AS_XHTML;

  readonly options: number;

  constructor(options = 0) {
    this.options = options;
  }

  toI(): number {
    return this.options;
  }
}
