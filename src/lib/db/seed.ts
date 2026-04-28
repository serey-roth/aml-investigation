import Database from "better-sqlite3";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { createSchema } from "./schema";
import { getTypologyDefinition } from "../typologies";
import { OllamaEmbeddings } from "@langchain/ollama";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";

const DATA_DIR = path.join(process.cwd(), "src/data");
const DB_PATH = path.join(DATA_DIR, "aml.db");
const CLEAN_ACCOUNT_SAMPLE = 200;
const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
});


interface LaunderingAttempt {
  typology: string;
  accounts: Set<string>;
  transactionCount: number;
}

interface AccountRow {
  account_id: string;
  bank_id: string;
  bank_name: string;
  entity_name: string;
}

interface TxRow {
  timestamp: string;
  from_bank: string;
  from_account: string;
  to_bank: string;
  to_account: string;
  amount_paid: number;
  payment_currency: string;
  amount_received: number;
  receiving_currency: string;
  payment_format: string;
  is_laundering: number;
}

async function parsePatternsFile(): Promise<LaunderingAttempt[]> {
  const attempts: LaunderingAttempt[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(DATA_DIR, "HI-Small_Patterns.txt")) });

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
        current.accounts.add(parts[2].trim()); // from_account
        current.accounts.add(parts[4].trim()); // to_account
        current.transactionCount++;
      }
    }
  }

  return attempts;
}

// ---------- Stream CSV line by line ----------

async function streamCsv(filePath: string, onRow: (row: string[]) => void): Promise<void> {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (line.trim()) onRow(line.split(","));
  }
}

// ---------- Main ----------

async function seed() {
  console.log("Parsing patterns file...");
  const attempts = await parsePatternsFile();
  console.log(`Found ${attempts.length} laundering attempts`);

  // Collect all account IDs involved in laundering
  const launderingAccounts = new Set<string>();
  for (const attempt of attempts) {
    for (const id of attempt.accounts) launderingAccounts.add(id);
  }
  console.log(`Laundering accounts: ${launderingAccounts.size}`);

  // Sample clean accounts
  console.log("Sampling clean accounts...");
  const cleanAccounts: AccountRow[] = [];
  const allLaunderingAccountRows = new Map<string, AccountRow>();

  await streamCsv(path.join(DATA_DIR, "HI-Small_accounts.csv"), (parts) => {
    if (parts.length < 5) return;
    const row: AccountRow = {
      bank_name: parts[0].trim(),
      bank_id: parts[1].trim(),
      account_id: parts[2].trim(),
      entity_name: parts[4].trim(),
    };
    if (launderingAccounts.has(row.account_id)) {
      allLaunderingAccountRows.set(row.account_id, row);
    } else if (cleanAccounts.length < CLEAN_ACCOUNT_SAMPLE) {
      cleanAccounts.push(row);
    }
  });

  const allAccounts = [...allLaunderingAccountRows.values(), ...cleanAccounts];
  const allAccountIds = new Set(allAccounts.map((a) => a.account_id));
  console.log(`Total accounts to seed: ${allAccounts.length}`);

  // Stream transactions for selected accounts
  console.log("Streaming transactions (this may take a moment)...");
  const transactions: TxRow[] = [];

  await streamCsv(path.join(DATA_DIR, "HI-Small_Trans.csv"), (parts) => {
    if (parts.length < 11) return;
    const fromAccount = parts[2].trim();
    const toAccount = parts[4].trim();
    if (!allAccountIds.has(fromAccount) && !allAccountIds.has(toAccount)) return;

    transactions.push({
      timestamp: parts[0].trim(),
      from_bank: parts[1].trim(),
      from_account: fromAccount,
      to_bank: parts[3].trim(),
      to_account: toAccount,
      amount_received: parseFloat(parts[5]),
      receiving_currency: parts[6].trim(),
      amount_paid: parseFloat(parts[7]),
      payment_currency: parts[8].trim(),
      payment_format: parts[9].trim(),
      is_laundering: parseInt(parts[10]),
    });
  });

  console.log(`Transactions to seed: ${transactions.length}`);

  // Write to SQLite
  console.log("Writing to SQLite...");
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const db = new Database(DB_PATH);
  createSchema(db);

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO accounts (account_id, bank_id, bank_name, entity_name)
    VALUES (@account_id, @bank_id, @bank_name, @entity_name)
  `);

  const insertTx = db.prepare(`
    INSERT INTO transactions
      (timestamp, from_account, from_bank, to_account, to_bank,
       amount_paid, payment_currency, amount_received, receiving_currency,
       payment_format, is_laundering)
    VALUES
      (@timestamp, @from_account, @from_bank, @to_account, @to_bank,
       @amount_paid, @payment_currency, @amount_received, @receiving_currency,
       @payment_format, @is_laundering)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO alerts (account_id, typology, description, status)
    VALUES (@account_id, @typology, @description, @status)
  `);

  const insertCase = db.prepare(`
    INSERT INTO case_memory (alert_id, typology, description, outcome, distinguishing_factor)
    VALUES (@alert_id, @typology, @description, @outcome, @distinguishing_factor)
  `);

  db.transaction(() => {
    for (const a of allAccounts) insertAccount.run(a);
  })();

  db.transaction(() => {
    for (const tx of transactions) insertTx.run(tx);
  })();

  // Seed alerts + case_memory from laundering attempts
  db.transaction(() => {
    for (const attempt of attempts) {
      const primaryAccount = [...attempt.accounts][0];
      const description = `${attempt.typology} pattern involving ${attempt.accounts.size} accounts and ${attempt.transactionCount} transactions`;
      const typology = getTypologyDefinition(attempt.typology);

      const alertResult = insertAlert.run({
        account_id: primaryAccount,
        typology: attempt.typology,
        description,
        status: "closed",
      });

      insertCase.run({
        alert_id: alertResult.lastInsertRowid,
        typology: attempt.typology,
        description,
        outcome: "SAR_FILED",
        distinguishing_factor: typology?.amlSignificance ?? "Suspicious transaction pattern detected",
      });
    }

    // Add a few NO_FILE cases for realism
    const noFileCases = [
      { typology: "FAN-OUT", description: "Fan-out pattern — customer confirmed as payroll processor", distinguishing_factor: "Legitimate business with documented payroll operations" },
      { typology: "CYCLE", description: "Apparent cycle — traced to intercompany treasury management", distinguishing_factor: "Funds returned to parent entity, documented sweep arrangement" },
      { typology: "GATHER-SCATTER", description: "Gather-scatter pattern — investment fund rebalancing", distinguishing_factor: "Customer is registered investment advisor with regulatory filings" },
    ];

    for (const c of noFileCases) {
      const alertResult = insertAlert.run({
        account_id: [...launderingAccounts][0],
        typology: c.typology,
        description: c.description,
        status: "closed",
      });
      insertCase.run({
        alert_id: alertResult.lastInsertRowid,
        typology: c.typology,
        description: c.description,
        outcome: "NO_FILE",
        distinguishing_factor: c.distinguishing_factor,
      });
    }
  })();

  // Seed open alerts — one per typology for the dashboard queue
  const typologiesSeeded = new Set<string>();
  db.transaction(() => {
    for (const attempt of attempts) {
      if (typologiesSeeded.has(attempt.typology)) continue;
      typologiesSeeded.add(attempt.typology);
      const primaryAccount = [...attempt.accounts][0];
      insertAlert.run({
        account_id: primaryAccount,
        typology: attempt.typology,
        description: `${attempt.typology} pattern detected: ${attempt.accounts.size} accounts involved, ${attempt.transactionCount} transactions flagged`,
        status: "open",
      });
    }
  })();

  const txCount = (db.prepare("SELECT COUNT(*) as n FROM transactions").get() as { n: number }).n;
  const acctCount = (db.prepare("SELECT COUNT(*) as n FROM accounts").get() as { n: number }).n;
  const caseCount = (db.prepare("SELECT COUNT(*) as n FROM case_memory").get() as { n: number }).n;

  // --- FAISS Integration Start ---
console.log("Building FAISS vector index for similarity search...");

const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text", // The model you just pulled!
});

// We query the cases we just inserted into SQLite to embed them
const cases = db.prepare("SELECT * FROM case_memory").all() as any[];

const docs = cases.map(c => new Document({
  pageContent: `Typology: ${c.typology}. Factors: ${c.distinguishing_factor}`,
  metadata: { id: c.id, outcome: c.outcome }
}));

// Create the FAISS store and save it locally
const vectorStore = await FaissStore.fromDocuments(docs, embeddings);
const INDEX_PATH = path.join(DATA_DIR, "faiss_index");
await vectorStore.save(INDEX_PATH);

console.log(`FAISS index saved to ${INDEX_PATH}`);
// --- FAISS Integration End ---

  db.close();
  console.log(`\nDone.`);
  console.log(`  Accounts:    ${acctCount}`);
  console.log(`  Transactions: ${txCount}`);
  console.log(`  Case memory: ${caseCount}`);
}

seed().catch(console.error);
