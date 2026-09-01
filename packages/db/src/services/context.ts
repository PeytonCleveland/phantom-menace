import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import * as s from "../schema/index";

/**
 * Context authoring and the canonicalization rule.
 *
 * `canonicalContextKey` mirrors governance.canonical_context_key. The database
 * function is authoritative — assertions are written with it — and this mirror
 * exists for previews and for building query predicates. The two are kept
 * honest by a test that compares them on the same inputs.
 */

export interface ContextDimensionInput {
  code: string;
  name: string;
  description?: string;
}

export interface ContextValueInput {
  dimensionCode: string;
  code: string;
  name: string;
  description?: string;
  /** Value code within the same dimension. Evidence here is valid for the parent. */
  parentCode?: string;
}

/** Sorted by dimension code, `dimension=value` joined by `;`, `''` when empty. */
export function canonicalContextKey(contexts: Record<string, string>): string {
  return Object.keys(contexts)
    .sort()
    .map((dimension) => `${dimension}=${contexts[dimension]}`)
    .join(";");
}

export class ContextService {
  /** "<dimension>:<value>" -> context_value.id */
  readonly valueIdByCode = new Map<string, string>();

  constructor(private readonly db: Database) {}

  async createDimension(input: ContextDimensionInput): Promise<void> {
    await this.db.insert(s.contextDimension).values({
      code: input.code,
      name: input.name,
      description: input.description ?? "",
    });
  }

  async createValue(input: ContextValueInput): Promise<string> {
    const parentValueId = input.parentCode
      ? this.requireValue(input.dimensionCode, input.parentCode)
      : null;

    const [created] = await this.db
      .insert(s.contextValue)
      .values({
        dimensionCode: input.dimensionCode,
        code: input.code,
        name: input.name,
        description: input.description ?? "",
        parentValueId,
      })
      .returning({ id: s.contextValue.id });
    if (!created) throw new Error(`failed to insert context value ${input.code}`);

    this.valueIdByCode.set(`${input.dimensionCode}:${input.code}`, created.id);
    return created.id;
  }

  requireValue(dimensionCode: string, valueCode: string): string {
    const id = this.valueIdByCode.get(`${dimensionCode}:${valueCode}`);
    if (!id) throw new Error(`unknown context value ${dimensionCode}:${valueCode}`);
    return id;
  }
}

/** Resolve a context value by codes, for callers without a live service. */
export async function findContextValueId(
  db: Database,
  dimensionCode: string,
  valueCode: string,
): Promise<string> {
  const rows = await db
    .select({ id: s.contextValue.id })
    .from(s.contextValue)
    .where(
      and(eq(s.contextValue.dimensionCode, dimensionCode), eq(s.contextValue.code, valueCode)),
    );
  const id = rows[0]?.id;
  if (!id) throw new Error(`unknown context value ${dimensionCode}:${valueCode}`);
  return id;
}
