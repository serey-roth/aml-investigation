import { getDb } from "../client";
import { CaseDb } from "../types";
import { Case } from "@/lib/types";

function toCaseDto(row: CaseDb): Case {
  return {
    id: row.id,
    alertId: row.alert_id,
    typology: row.typology,
    description: row.description,
    outcome: row.outcome,
    distinguishingFactor: row.distinguishing_factor,
  };
}

export function findSimilarCases(vector: number[], k = 3): Case[] {
  const rows = getDb().prepare(`
    SELECT c.id, c.alert_id, c.typology, c.description, c.outcome, c.distinguishing_factor
    FROM case_embeddings ce
    JOIN case_memory c ON c.id = ce.case_id
    WHERE ce.embedding MATCH ?
      AND k = ?
    ORDER BY ce.distance
  `).all(JSON.stringify(vector), k) as CaseDb[];

  return rows.map(toCaseDto);
}
