import { ActiveStorage } from "../active-storage.js";
import { NullAnalyzer } from "../analyzer/null-analyzer.js";
import { AnalyzeJob } from "../analyze-job.js";
import type { Blob } from "../blob.js";

async function analyze(this: Blob): Promise<void> {
  await this.updateBang({
    metadata: this.metadata.merge(await this.extractMetadataViaAnalyzer()),
  });
}

async function analyzeLater(this: Blob): Promise<void> {
  if (this.analyzerClass().isAnalyzeLater()) {
    await AnalyzeJob.performLater(this);
  } else {
    await this.analyze();
  }
}

function isAnalyzed(this: Blob): unknown {
  return this.analyzed;
}

/** @internal */
async function extractMetadataViaAnalyzer(this: Blob): Promise<{ [k: string]: unknown }> {
  return { ...(await this.analyzer().metadata()), analyzed: true };
}

/** @internal */
function analyzer(this: Blob) {
  return new (this.analyzerClass())(this);
}

/** @internal */
function analyzerClass(this: Blob) {
  return ActiveStorage.analyzers.find((klass) => klass.isAccept(this)) ?? NullAnalyzer;
}

export const Analyzable = {
  analyze,
  analyzeLater,
  isAnalyzed,
  extractMetadataViaAnalyzer,
  analyzer,
  analyzerClass,
};
