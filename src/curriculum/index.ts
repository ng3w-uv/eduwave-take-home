import { readFileSync } from "node:fs";
import { z } from "zod";
import { config } from "../config.js";

/** Shape of an item in eduwave_fraction_curriculum.json. IDs are preserved so
 * citations can be verified against them. */
const CurriculumItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  keywords: z.array(z.string()),
  common_misconceptions: z.array(z.string()),
});

const CurriculumSchema = z.array(CurriculumItemSchema).min(1);

export type CurriculumItem = z.infer<typeof CurriculumItemSchema>;

/**
 * Loads and validates the curriculum from disk. Throws a clear error on malformed
 * data or duplicate IDs — the whole grounding story depends on stable, unique IDs.
 */
export function loadCurriculum(path = config.CURRICULUM_PATH): CurriculumItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `Failed to read/parse curriculum at "${path}": ${(err as Error).message}`,
    );
  }

  const parsed = CurriculumSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Curriculum failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  const ids = new Set<string>();
  for (const item of parsed.data) {
    if (ids.has(item.id)) {
      throw new Error(`Duplicate curriculum id: ${item.id}`);
    }
    ids.add(item.id);
  }

  return parsed.data;
}

/**
 * An in-memory index over the curriculum. Built once at boot; retrieval (Phase 2)
 * scores against it. Kept tiny and explicit — 8 items don't need a vector store.
 */
export class Curriculum {
  private readonly byId: Map<string, CurriculumItem>;

  constructor(public readonly items: CurriculumItem[]) {
    this.byId = new Map(items.map((it) => [it.id, it]));
  }

  static load(path?: string): Curriculum {
    return new Curriculum(loadCurriculum(path));
  }

  get(id: string): CurriculumItem | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get ids(): string[] {
    return [...this.byId.keys()];
  }
}
