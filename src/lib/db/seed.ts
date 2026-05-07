import Database from "better-sqlite3";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { createSchema } from "./schema";
import { getTypologyDefinition } from "../typologies";
import { OllamaEmbeddings } from "@langchain/ollama";
import * as sqliteVec from "sqlite-vec";
import { AccountDb, TransactionDb } from "./types";

const DATA_DIR = path.join(process.cwd(), "src/data");
const DB_PATH = path.join(DATA_DIR, "aml.db");
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

function seedAccounts(db: Database.Database, accounts: AccountDb[]): void {
  const insert = db.prepare(`
    INSERT INTO accounts (account_id, bank_id, bank_name, entity_name)
    VALUES (@account_id, @bank_id, @bank_name, @entity_name)
  `);
  db.transaction(() => { for (const a of accounts) insert.run(a); })();
}

function seedTransactions(db: Database.Database, transactions: TransactionDb[]): void {
  const insert = db.prepare(`
    INSERT INTO transactions
      (timestamp, from_account, from_bank, to_account, to_bank,
       amount_paid, payment_currency, amount_received, receiving_currency,
       payment_format, is_laundering)
    VALUES
      (@timestamp, @from_account, @from_bank, @to_account, @to_bank,
       @amount_paid, @payment_currency, @amount_received, @receiving_currency,
       @payment_format, @is_laundering)
  `);
  db.transaction(() => { for (const tx of transactions) insert.run(tx); })();
}

function seedCaseMemory(db: Database.Database, attempts: LaunderingAttempt[]): void {
  const insertAlert = db.prepare(`INSERT INTO alerts (account_id, typology, description, status) VALUES (@account_id, @typology, @description, @status)`);
  const insertCase = db.prepare(`INSERT INTO case_memory (alert_id, typology, description, outcome, distinguishing_factor) VALUES (@alert_id, @typology, @description, @outcome, @distinguishing_factor)`);

  db.transaction(() => {
    for (const attempt of attempts) {
      const primaryAccount = [...attempt.accounts][0];
      const description = `${attempt.typology} pattern involving ${attempt.accounts.size} accounts and ${attempt.transactionCount} transactions`;
      const typology = getTypologyDefinition(attempt.typology);
      const alertResult = insertAlert.run({ account_id: primaryAccount, typology: attempt.typology, description, status: "closed" });
      insertCase.run({ alert_id: alertResult.lastInsertRowid, typology: attempt.typology, description, outcome: "SAR_FILED", distinguishing_factor: typology?.amlSignificance ?? "Suspicious transaction pattern detected" });
    }
  })();
}

function seedOpenAlerts(db: Database.Database, attempts: LaunderingAttempt[]): void {
  const insert = db.prepare(`INSERT INTO alerts (account_id, typology, description, status) VALUES (@account_id, @typology, @description, @status)`);
  const seenTypologies = new Set<string>();
  db.transaction(() => {
    for (const attempt of attempts) {
      if (seenTypologies.has(attempt.typology)) continue;
      seenTypologies.add(attempt.typology);
      insert.run({ account_id: [...attempt.accounts][0], typology: attempt.typology, description: `${attempt.typology}: ${attempt.accounts.size} accounts involved, ${attempt.transactionCount} transactions flagged`, status: "open" });
    }
  })();
}

async function seedEmbeddings(db: Database.Database): Promise<number> {
  sqliteVec.load(db);
  const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
  const cases = db.prepare("SELECT * FROM case_memory").all() as any[];
  const insert = db.prepare("INSERT INTO case_embeddings (case_id, embedding) VALUES (?, ?)");
  for (const c of cases) {
    const vector = await embeddings.embedQuery(`Typology: ${c.typology}. Factors: ${c.distinguishing_factor}`);
    insert.run(BigInt(c.id), JSON.stringify(vector));
  }
  return cases.length;
}

async function seed() {
  console.log("Parsing laundering patterns file...");
  const attempts = await parsePatternsTxt("HI-Small_Patterns.txt");
  console.log(`Found ${attempts.length} laundering attempts`);

  console.log("Collectiong account IDs involved in laundering...")
  const accountsInLaundering = new Set<string>();
  for (const attempt of attempts) {
    for (const id of attempt.accounts) accountsInLaundering.add(id);
  }
  console.log(`Accounts involved in laundering: ${accountsInLaundering.size}`);

  console.log("Parsing accounts file...");
  const { launderingAccounts, allAccounts } = await parseAccountCsv("HI-Small_accounts.csv", (accountId) => accountsInLaundering.has(accountId))
  console.log(`Total accounts: ${allAccounts.length}`);

  console.log("Parsing transactions file...");
  const allAccountIds = new Set(allAccounts.map(a => a.account_id));
  const transactions = await parseTransactionCsv("HI-Small_Trans.csv", allAccountIds);
  console.log(`Total transactions: ${transactions.length}`);

  console.log("Writing to DB...");
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const db = new Database(DB_PATH);
  createSchema(db);

  const { caseMemory, openAlerts } = splitAttempts(attempts);

  seedAccounts(db, allAccounts);
  seedTransactions(db, transactions);
  seedCaseMemory(db, caseMemory);
  seedOpenAlerts(db, openAlerts);
  await seedEmbeddings(db);

  db.close();
  console.log(`\nDone.`);
}

seed().catch(console.error);
