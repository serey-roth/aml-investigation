import Database from "better-sqlite3";

export function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      account_id   TEXT PRIMARY KEY,
      bank_id      TEXT,
      bank_name    TEXT,
      entity_name  TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp           TEXT,
      from_account        TEXT,
      from_bank           TEXT,
      to_account          TEXT,
      to_bank             TEXT,
      amount_paid         REAL,
      payment_currency    TEXT,
      amount_received     REAL,
      receiving_currency  TEXT,
      payment_format      TEXT,
      is_laundering       INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_account);
    CREATE INDEX IF NOT EXISTS idx_tx_to   ON transactions(to_account);
    CREATE INDEX IF NOT EXISTS idx_tx_ts   ON transactions(timestamp);

    CREATE TABLE IF NOT EXISTS alerts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  TEXT,
      typology    TEXT,
      description TEXT,
      status      TEXT DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS case_memory (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id             INTEGER REFERENCES alerts(id),
      typology             TEXT,
      description          TEXT,
      outcome              TEXT,
      distinguishing_factor TEXT
    );
  `);
}
