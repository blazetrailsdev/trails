import { Analyzer } from "../analyzer.js";
import type { Blob } from "../blob.js";

export class NullAnalyzer extends Analyzer {
  static override isAccept(_blob: Blob): boolean {
    return true;
  }

  static override isAnalyzeLater(): boolean {
    return false;
  }

  override async metadata(): Promise<{ [k: string]: unknown }> {
    return {};
  }
}
