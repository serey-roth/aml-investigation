/**
 * Database test script — run with: npm run db:check
 *
 * TC-01  Data Integrity      — row count on transactions
 * TC-02  Indexing Performance — same account query with and without index
 * TC-03  Relational Integrity — transactions ⟶ accounts JOIN
 * TC-04  Case Memory Retrieval — alerts ⟶ case_memory JOIN
 */

import pool from "./client";

function pass(tc: string, msg: string) {
  console.log(`  ✓ ${tc}: ${msg}`);
}

function info(label: string, rows: unknown[]) {
  console.log(`\n  ${label}`);
  console.table(rows);
}

async function tc01() {
  console.log("\nTC-01 — Data Integrity (row count)");
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM transactions") as [{ total: number }[], unknown];
  const total = rows[0].total;
  if (total === 0) throw new Error("transactions table is empty — did you run npm run seed?");
  pass("TC-01", `transactions: ${total.toLocaleString()} rows`);
}

async function tc02() {
  console.log("\nTC-02 — Indexing Performance (B-Tree check)");

  // Pick a real account ID from the table
  const [sample] = await pool.query(
    "SELECT DISTINCT from_account FROM transactions LIMIT 5"
  ) as [{ from_account: string }[], unknown];

  if (!sample.length) throw new Error("No transactions found");
  const account = sample[0].from_account;
  console.log(`  Using account: ${account}`);

  // Without index
  const t0 = Date.now();
  const [noIdx] = await pool.query(
    "SELECT * FROM transactions IGNORE INDEX (idx_tx_from) WHERE from_account = ?",
    [account]
  ) as [unknown[], unknown];
  const noIdxMs = Date.now() - t0;

  // With index
  const t1 = Date.now();
  const [withIdx] = await pool.query(
    "SELECT * FROM transactions USE INDEX (idx_tx_from) WHERE from_account = ?",
    [account]
  ) as [unknown[], unknown];
  const withIdxMs = Date.now() - t1;

  pass("TC-02", `${(noIdx as unknown[]).length} rows — without index: ${noIdxMs}ms  |  with index: ${withIdxMs}ms`);
}

async function tc03() {
  console.log("\nTC-03 — Relational Integrity (transactions ⟶ accounts JOIN)");
  const [rows] = await pool.query(`
    SELECT
      t.id               AS transaction_id,
      t.timestamp,
      t.from_account,
      a.entity_name      AS from_entity,
      a.bank_name        AS from_bank_name,
      t.to_account,
      t.amount_paid,
      t.payment_currency,
      t.payment_format
    FROM transactions t
    JOIN accounts a ON t.from_account = a.account_id
    LIMIT 5
  `) as [unknown[], unknown];

  if (!(rows as unknown[]).length) throw new Error("JOIN returned no rows — accounts table may be empty");
  pass("TC-03", `JOIN returned ${(rows as unknown[]).length} rows`);
  info("Sample (transactions ⟶ accounts):", rows as unknown[]);
}

async function tc04() {
  console.log("\nTC-04 — Case Memory Retrieval (alerts ⟶ case_memory JOIN)");
  const [rows] = await pool.query(`
    SELECT
      al.id                    AS alert_id,
      al.account_id,
      al.typology              AS alert_typology,
      al.description           AS alert_description,
      cm.outcome,
      cm.distinguishing_factor
    FROM alerts al
    JOIN case_memory cm ON al.id = cm.alert_id
    LIMIT 5
  `) as [unknown[], unknown];

  if (!(rows as unknown[]).length) {
    console.log("  ⚠  No case_memory rows yet — close some cases first.");
    return;
  }
  pass("TC-04", `JOIN returned ${(rows as unknown[]).length} rows`);
  info("Sample (alerts ⟶ case_memory):", rows as unknown[]);
}

async function run() {
  console.log("=== AML database test queries ===");
  try {
    await tc01();
    await tc02();
    await tc03();
    await tc04();
    console.log("\nAll tests passed.\n");
  } catch (err) {
    console.error("\n✗ Test failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
