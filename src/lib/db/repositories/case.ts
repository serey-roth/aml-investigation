import pool from "../client";
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

export async function findSimilarCases(vector: number[], k = 3): Promise<Case[]> {
  // MySQL 9.0 KNN: VECTOR_DISTANCE() computes cosine distance between the query
  // vector and each stored embedding. ORDER BY + LIMIT returns the k closest cases.
  const vectorJson = JSON.stringify(vector);
  const [rows] = await pool.query(
    `SELECT c.id, c.alert_id, c.typology, c.description, c.outcome, c.distinguishing_factor
     FROM case_embeddings ce
     JOIN case_memory c ON c.id = ce.case_id
     ORDER BY VECTOR_DISTANCE(ce.embedding, VECTOR_FROM_JSON(?), 'COSINE')
     LIMIT ?`,
    [vectorJson, k]
  ) as unknown as [CaseDb[], unknown];
  return rows.map(toCaseDto);
}

export async function insertCaseEmbedding(caseId: number, vector: number[]): Promise<void> {
  await pool.query(
    "INSERT INTO case_embeddings (case_id, embedding) VALUES (?, VECTOR_FROM_JSON(?))",
    [caseId, JSON.stringify(vector)]
  );
}
