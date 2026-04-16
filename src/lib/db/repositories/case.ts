import { getDb } from "../client";

export interface CaseRow {
  id: number;
  typology: string;
  description: string;
  outcome: string;
  distinguishing_factor: string;
}

export function getCasesByTypology(typology: string | null): CaseRow[] {
  return getDb().prepare<[string | null, string | null]>(`
    SELECT id, typology, description, outcome, distinguishing_factor
    FROM case_memory
    WHERE (? IS NULL OR typology = ?)
    ORDER BY RANDOM()
    LIMIT 3
  `).all(typology, typology) as CaseRow[];
}

export function getRandomCases(): CaseRow[] {
  return getDb().prepare(`
    SELECT id, typology, description, outcome, distinguishing_factor
    FROM case_memory ORDER BY RANDOM() LIMIT 3
  `).all() as CaseRow[];
}
