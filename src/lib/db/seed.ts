import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { ResultSetHeader } from "mysql2/promise";
import pool from "./client";
import { createSchema } from "./schema";
import { getTypologyDefinition } from "../typologies";
import { OllamaEmbeddings } from "@langchain/ollama";
import { AccountDb, CaseDb, TransactionDb } from "./types";

const DATA_DIR = path.join(process.cwd(), "src/data");
const CLEAN_ACCOUNT_SAMPLE = 200;

interface LaunderingAttempt {
  typology: string;
  accounts: Set<string>;
  transactionCount: number;
}

async function parsePatternsTxt(filePath: string): Promise<LaunderingAttempt[]> {
  const fullPath = path.join(DATA_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  const attempts: LaunderingAttempt[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(fullPath) });

  let current: LaunderingAttempt | null = null;

  for await (const line of rl) {
    const beginMatch = line.match(/^BEGIN LAUNDERING ATTEMPT - ([^:]+)/);
    const endMatch = line.match(/^END LAUNDERING ATTEMPT/);

    if (beginMatch) {
      current = { typology: beginMatch[1].trim(), accounts: new Set(), transactionCount: 0 };
    } else if (endMatch && current) {
      attempts.push(current);
      current = null;
    } else if (current && line.trim() && !line.startsWith("BEGIN") && !line.startsWith("END")) {
      const parts = line.split(",");
      if (parts.length >= 5) {
        const fromAccount = parts[2].trim();
        const toAccount = parts[4].trim()
        current.accounts.add(fromAccount);
        current.accounts.add(toAccount);
        current.transactionCount++;
      }
    }
  }

  return attempts;
}


async function streamCsv(filePath: string, onRow: (row: string[]) => void): Promise<void> {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (line.trim()) onRow(line.split(","));
  }
}


async function parseAccountCsv(filePath: string, isLaunderingAccount: (accountId: string) => boolean) {
  const fullPath = path.join(DATA_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  const cleanAccounts: AccountDb[] = [];
  const launderingAccounts = new Map<string, AccountDb>();

  console.log("Collecting clean and laundering accounts...")
  await streamCsv(fullPath, (parts) => {
    if (parts.length < 5) return;
    const account: AccountDb = {
      bank_name: parts[0].trim(),
      bank_id: parts[1].trim(),
      account_id: parts[2].trim(),
      entity_name: parts[4].trim(),
    };
    if (isLaunderingAccount(account.account_id)) {
      launderingAccounts.set(account.account_id, account);
    } else if (cleanAccounts.length < CLEAN_ACCOUNT_SAMPLE) {
      cleanAccounts.push(account);
    }
  });

  const allAccounts = [...launderingAccounts.values(), ...cleanAccounts];

  return {
    cleanAccounts,
    launderingAccounts,
    allAccounts
  }
}


async function parseTransactionCsv(filePath: string, allAccountIds: Set<String>) {
  const transactions: TransactionDb[] = [];

  await streamCsv(path.join(DATA_DIR, filePath), (parts) => {
    if (parts.length < 11) return;
    const fromAccountId = parts[2].trim();
    const toAccountId = parts[4].trim();
    if (!allAccountIds.has(fromAccountId) && !allAccountIds.has(toAccountId)) return;

    transactions.push({
      timestamp: parts[0].trim(),
      from_bank: parts[1].trim(),
      from_account: fromAccountId,
      to_bank: parts[3].trim(),
      to_account: toAccountId,
      amount_received: parseFloat(parts[5]),
      receiving_currency: parts[6].trim(),
      amount_paid: parseFloat(parts[7]),
      payment_currency: parts[8].trim(),
      payment_format: parts[9].trim(),
      is_laundering: parseInt(parts[10]),
    });
  });

  return transactions
}


function splitAttempts(attempts: LaunderingAttempt[]): { caseMemory: LaunderingAttempt[]; openAlerts: LaunderingAttempt[] } {
  const byTypology = Map.groupBy(attempts, (a) => a.typology);
  const caseMemory: LaunderingAttempt[] = [];
  const openAlerts: LaunderingAttempt[] = [];

  for (const [, group] of byTypology) {
    const split = Math.max(1, Math.floor(group.length * 0.8));
    caseMemory.push(...group.slice(0, split));
    openAlerts.push(...group.slice(split));
  }

  return { caseMemory, openAlerts };
}

async function clearTables(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of ["case_embeddings", "case_memory", "investigation_snapshots", "audit_trail", "alerts", "transactions", "accounts"]) {
      await conn.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}

async function seedAccounts(accounts: AccountDb[]): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const rows = accounts.map(a => [a.account_id, a.bank_id, a.bank_name, a.entity_name]);
    await conn.query(
      "INSERT INTO accounts (account_id, bank_id, bank_name, entity_name) VALUES ?",
      [rows]
    );
  } finally {
    conn.release();
  }
}

// mysql2 max_allowed_packet limits batch size — chunk large inserts to stay safe.
const TX_CHUNK_SIZE = 5_000;

async function seedTransactions(transactions: TransactionDb[]): Promise<void> {
  const conn = await pool.getConnection();
  try {
    for (let i = 0; i < transactions.length; i += TX_CHUNK_SIZE) {
      const chunk = transactions.slice(i, i + TX_CHUNK_SIZE);
      const rows = chunk.map(tx => [
        tx.timestamp, tx.from_account, tx.from_bank, tx.to_account, tx.to_bank,
        tx.amount_paid, tx.payment_currency, tx.amount_received, tx.receiving_currency,
        tx.payment_format, tx.is_laundering,
      ]);
      await conn.query(
        `INSERT INTO transactions
          (timestamp, from_account, from_bank, to_account, to_bank,
           amount_paid, payment_currency, amount_received, receiving_currency,
           payment_format, is_laundering)
         VALUES ?`,
        [rows]
      );
    }
  } finally {
    conn.release();
  }
}

async function seedCaseMemory(attempts: LaunderingAttempt[]): Promise<void> {
  const now = Date.now();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const toDatetime = (ms: number) =>
    new Date(ms).toISOString().replace("T", " ").slice(0, 19);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const primaryAccount = [...attempt.accounts][0];
      const description = `${attempt.accounts.size} accounts involved, ${attempt.transactionCount} transactions flagged`;
      const typology = getTypologyDefinition(attempt.typology);
      const closedAt = now - (ninetyDays * (1 - i / attempts.length));
      const investigationDays = (1 + (i % 7)) * 24 * 60 * 60 * 1000;
      const createdAt = closedAt - investigationDays;

      const [alertResult] = await conn.query<ResultSetHeader>(
        "INSERT INTO alerts (account_id, typology, description, status, created_at, closed_at) VALUES (?, ?, ?, 'closed', ?, ?)",
        [primaryAccount, attempt.typology, description, toDatetime(createdAt), toDatetime(closedAt)]
      );
      const alertId = alertResult.insertId;

      await conn.query(
        "INSERT INTO case_memory (alert_id, typology, description, outcome, distinguishing_factor) VALUES (?, ?, ?, 'SAR_FILED', ?)",
        [alertId, attempt.typology, description, typology?.amlSignificance ?? "Suspicious transaction pattern detected"]
      );
      await conn.query(
        "INSERT INTO audit_trail (alert_id, actor, action, detail, created_at) VALUES (?, 'analyst', 'decision', ?, ?)",
        [alertId, JSON.stringify({ outcome: "SAR_FILED", note: "Seeded case" }), toDatetime(closedAt)]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function seedOpenAlerts(attempts: LaunderingAttempt[]): Promise<void> {
  const seenTypologies = new Set<string>();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const attempt of attempts) {
      if (seenTypologies.has(attempt.typology)) continue;
      seenTypologies.add(attempt.typology);
      await conn.query(
        "INSERT INTO alerts (account_id, typology, description, status) VALUES (?, ?, ?, 'open')",
        [[...attempt.accounts][0], attempt.typology, `${attempt.accounts.size} accounts involved, ${attempt.transactionCount} transactions flagged`]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function seedEmbeddings(): Promise<number> {
  const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
  const [cases] = await pool.query(
    "SELECT id, typology, distinguishing_factor FROM case_memory"
  ) as unknown as [CaseDb[], unknown];
  for (const c of cases) {
    const vector = await embeddings.embedQuery(`Typology: ${c.typology}. Factors: ${c.distinguishing_factor}`);
    await pool.query(
      "INSERT INTO case_embeddings (case_id, embedding) VALUES (?, STRING_TO_VECTOR(?))",
      [c.id, JSON.stringify(vector)]
    );
  }
  return cases.length;
}

async function seed() {
  console.log("Parsing laundering patterns file...");
  const attempts = await parsePatternsTxt("HI-Small_Patterns.txt");
  console.log(`Found ${attempts.length} laundering attempts`);

  console.log("Collecting account IDs involved in laundering...")
  const accountsInLaundering = new Set<string>();
  for (const attempt of attempts) {
    for (const id of attempt.accounts) accountsInLaundering.add(id);
  }
  console.log(`Accounts involved in laundering: ${accountsInLaundering.size}`);

  console.log("Parsing accounts file...");
  const { allAccounts } = await parseAccountCsv("HI-Small_accounts.csv", (accountId) => accountsInLaundering.has(accountId))
  console.log(`Total accounts: ${allAccounts.length}`);

  console.log("Parsing transactions file...");
  const allAccountIds = new Set(allAccounts.map(a => a.account_id));
  const transactions = await parseTransactionCsv("HI-Small_Trans.csv", allAccountIds);
  console.log(`Total transactions: ${transactions.length}`);

  console.log("Dropping existing tables...");
  await clearTables();

  console.log("Creating schema...");
  await createSchema();

  const { caseMemory, openAlerts } = splitAttempts(attempts);

  await seedAccounts(allAccounts);
  await seedTransactions(transactions);
  await seedCaseMemory(caseMemory);
  await seedOpenAlerts(openAlerts);
  await seedEmbeddings();

  await pool.end();
  console.log(`\nDone.`);
}

seed().catch(console.error);
