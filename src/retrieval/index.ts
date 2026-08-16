import type { Curriculum, CurriculumItem } from "../curriculum/index.js";

/**
 * Keyword retrieval over the (tiny) curriculum. Deterministic and explainable:
 * each result carries its score and the exact terms that matched, which is the
 * "why this context is relevant" the brief asks for. 8 items don't justify
 * embeddings — that's a documented future improvement.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "am", "be", "do", "does", "did", "i", "you",
  "we", "it", "he", "she", "they", "how", "to", "and", "or", "of", "in", "on",
  "at", "for", "with", "this", "that", "these", "those", "what", "why", "when",
  "which", "can", "could", "would", "should", "my", "me", "your", "our", "still",
  "not", "no", "yes", "dont", "don", "t", "s", "please", "help", "understand",
  "understanding", "get", "so", "if", "about",
]);

const WEIGHTS = { keyword: 3, title: 2, content: 1 } as const;

/** Lowercase, split on non-alphanumerics, drop stopwords, light singularization. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(normalize)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Very light stemming: strip a trailing plural "s" so "denominators" ~ "denominator". */
function normalize(token: string): string {
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

interface ItemIndex {
  item: CurriculumItem;
  keywords: Set<string>;
  title: Set<string>;
  content: Set<string>;
}

function indexItem(item: CurriculumItem): ItemIndex {
  return {
    item,
    keywords: new Set(item.keywords.flatMap((k) => tokenize(k))),
    title: tokenSet(item.title),
    content: tokenSet(item.content),
  };
}

export interface ScoredItem {
  id: string;
  item: CurriculumItem;
  score: number;
  /** The query terms that caused this item to be selected. */
  matched: string[];
}

export interface RetrievalResult {
  query: string;
  results: ScoredItem[];
  /** True when nothing in the curriculum matched — caller should reuse prior topic. */
  lowSignal: boolean;
}

export interface RetrieveOptions {
  topK?: number;
  threshold?: number;
}

/**
 * Scores every curriculum item against `query`. For each distinct query token we
 * credit the single highest-weight place it appears (keyword > title > content),
 * so a term is never double-counted.
 */
export function retrieve(
  curriculum: Curriculum,
  query: string,
  opts: RetrieveOptions = {},
): RetrievalResult {
  const { topK = 3, threshold = 1 } = opts;
  const queryTokens = [...new Set(tokenize(query))];

  const scored: ScoredItem[] = curriculum.items.map((item) => {
    const idx = indexItem(item);
    let score = 0;
    const matched: string[] = [];
    for (const t of queryTokens) {
      if (idx.keywords.has(t)) score += WEIGHTS.keyword;
      else if (idx.title.has(t)) score += WEIGHTS.title;
      else if (idx.content.has(t)) score += WEIGHTS.content;
      else continue;
      matched.push(t);
    }
    return { id: item.id, item, score, matched };
  });

  const results = scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK);

  return { query, results, lowSignal: results.length === 0 };
}
