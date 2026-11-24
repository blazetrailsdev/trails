import {
  defineModule,
  extend,
  included,
  isHtmlSafe,
  isPresent,
  presence,
} from "@blazetrails/activesupport";
import type { Base, Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import { HTML } from "@blazetrails/html-sanitizer";
import type { Leaf } from "../leaf.ts";

export const ClassMethods = {
  async reindexAll(this: typeof Leaf): Promise<void> {
    for (const leaf of await this.all().toArray()) await leaf.reindex();
  },

  sanitizeQuerySyntax(this: typeof Leaf, terms: unknown): string | null {
    let t = String(terms ?? "");
    t = ClassMethods.removeInvalidSearchCharacters(t);
    t = ClassMethods.quoteQueryTokens(t);
    return presence(t) ?? null;
  },

  search(this: typeof Leaf, terms: unknown): Relation<Leaf> {
    const sanitized = this.sanitizeQuerySyntax(terms);
    if (sanitized != null) {
      return this.withSearchResultsFor(sanitized).select(
        "leaves.*",
        "highlight(leaf_search_index, 0, '<mark>', '</mark>') as title_match",
        "snippet(leaf_search_index, 1, '<mark>', '</mark>', '...', 20) as content_match",
      );
    } else {
      return this.none();
    }
  },

  withSearchResultsFor(this: typeof Leaf, terms: string): Relation<Leaf> {
    return this.joins("join leaf_search_index on leaves.id = leaf_search_index.rowid").where(
      "leaf_search_index match ?",
      terms,
    );
  },

  removeInvalidSearchCharacters(terms: string): string {
    return terms.replace(/[^\w"]/g, " ");
  },

  quoteQueryTokens(terms: string): string {
    return (terms.match(/"[^"]*"|\w+/g) ?? [])
      .map((token) => presence(token.replaceAll('"', "")))
      .filter((token) => token != null)
      .map((token) => `"${token}"`)
      .join(" ");
  },
};

interface Host extends Leaf {
  isSearchable(): Promise<boolean>;
  sanitizeForIndex(text: string | null): string | null;
  createInSearchIndex(): Promise<void>;
  updateInSearchIndex(): Promise<void>;
  removeFromSearchIndex(): Promise<void>;
  executeSqlWithBinds(...statement: unknown[]): Promise<boolean>;
  uniqueMatchingTerms(content: string): string[];
}

export const Searchable = defineModule(
  {
    [included](base: typeof Base): void {
      extend(base, ClassMethods);

      base.afterCreateCommit(":createInSearchIndex", { if: ":isSearchable" });
      base.afterUpdateCommit(":updateInSearchIndex", { if: ":isSearchable" });
      base.afterDestroyCommit(":removeFromSearchIndex", { if: ":isSearchable" });

      base.scope("favoringTitle", function () {
        return this.order(sql("bm25(leaf_search_index, 2.0)"));
      });
    },

    async reindex(this: Host): Promise<void> {
      if (await this.isSearchable()) await this.updateInSearchIndex();
    },

    async matchesForHighlight(this: Host, terms: unknown): Promise<string[]> {
      const klass = this.constructor as typeof Leaf;
      const sanitized = klass.sanitizeQuerySyntax(terms);
      if (sanitized != null) {
        const content = (await klass
          .withSearchResultsFor(sanitized)
          .where({ id: this.id })
          .pick(sql("highlight(leaf_search_index, 1, '<mark>', '</mark>')"))) as string | null;

        return content ? this.uniqueMatchingTerms(content) : [];
      } else {
        return [];
      }
    },
  },
  undefined,
  {
    async isSearchable(this: Host): Promise<boolean> {
      return isPresent(await this.searchableContent());
    },

    sanitizeForIndex(this: Host, text: string | null): string | null {
      if (text == null) return text;
      if (isHtmlSafe(text)) {
        return text;
      } else {
        return new HTML.FullSanitizer().sanitize(text);
      }
    },

    async createInSearchIndex(this: Host): Promise<void> {
      await this.executeSqlWithBinds(
        "insert into leaf_search_index(rowid, title, content ) values (?, ?, ?)",
        this.id,
        this.sanitizeForIndex(this.title),
        this.sanitizeForIndex(await this.searchableContent()),
      );
    },

    async updateInSearchIndex(this: Host): Promise<void> {
      await this.transaction(async () => {
        const updated = await this.executeSqlWithBinds(
          "update leaf_search_index set title = ?, content = ? where rowid = ?",
          this.sanitizeForIndex(this.title),
          this.sanitizeForIndex(await this.searchableContent()),
          this.id,
        );

        if (!updated) await this.createInSearchIndex();
      });
    },

    async removeFromSearchIndex(this: Host): Promise<void> {
      await this.executeSqlWithBinds("delete from leaf_search_index where rowid = ?", this.id);
    },

    async executeSqlWithBinds(this: Host, ...statement: unknown[]): Promise<boolean> {
      const klass = this.constructor as typeof Leaf;
      const connection = await klass.leaseConnection();
      await connection.execute(klass.sanitizeSql(statement as [string, ...unknown[]]));

      return ((await connection.rawConnection()).changes ?? 0) !== 0;
    },

    uniqueMatchingTerms(this: Host, content: string): string[] {
      const terms = [...new Set([...content.matchAll(/<mark>(.*?)<\/mark>/g)].map((m) => m[1]))];
      return terms.sort((a, b) => a.length - b.length).reverse();
    },
  },
);
