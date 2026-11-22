import { Nokogiri } from "@blazetrails/nokogiri";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { Context, type IO } from "./parser/context.js";
import { Document } from "./document.js";
import { Error } from "./error.js";

export class Parser {
  static Context = Context;

  readonly context: Context;

  constructor(context: Context | null = null) {
    if (context == null) {
      throw new ArgumentError(
        "An instance of a XML::Parser::Context must be passed to XML::Parser.new",
      );
    }
    this.context = context;
  }

  static io(io: IO): Parser {
    const context = Parser.Context.io(io);
    return new this(context);
  }

  static string(string: string | null): Parser {
    const context = Parser.Context.string(string);
    return new this(context);
  }

  parse(): Document {
    const LibXml2 = Nokogiri.LibXml2!;
    try {
      return new Document(LibXml2.XmlDocument.fromString(this.context._source));
    } catch (e) {
      if (e instanceof LibXml2.XmlParseError) {
        throw new Error(e.details[0]?.message.trim() ?? e.message);
      }
      throw e;
    }
  }
}
