import pool from "./client";

export async function createSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        account_id   VARCHAR(64) PRIMARY KEY,
        bank_id      VARCHAR(64),
        bank_name    VARCHAR(128),
        entity_name  VARCHAR(128)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        timestamp           DATETIME,
        from_account        VARCHAR(64),
        from_bank           VARCHAR(64),
        to_account          VARCHAR(64),
        to_bank             VARCHAR(64),
        amount_paid         DECIMAL(18,2),
        payment_currency    VARCHAR(32),
        amount_received     DECIMAL(18,2),  -- may differ from amount_paid due to FX conversion
        receiving_currency  VARCHAR(32),
        payment_format      VARCHAR(32),
        is_laundering       TINYINT(1)      -- 1 = laundering, 0 = clean (IBM AML ground truth)
      )
    `);

    // Two separate indexes instead of one composite because the common query
    // filters on from_account OR to_account. Separate indexes let MySQL scan
    // each and merge rowid sets, reducing cost from O(n) to O(log n + k).
    await conn.query(`CREATE INDEX idx_tx_from ON transactions(from_account)`).catch(ignoreExisting);
    await conn.query(`CREATE INDEX idx_tx_to   ON transactions(to_account)`).catch(ignoreExisting);
    // Supports ORDER BY timestamp and time-range filters used in velocity queries.
    await conn.query(`CREATE INDEX idx_tx_ts   ON transactions(timestamp)`).catch(ignoreExisting);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        account_id  VARCHAR(64),
        typology    VARCHAR(64),
        description TEXT,
        status      VARCHAR(16) DEFAULT 'open',   -- open | escalated | rfi | closed
        created_at  DATETIME DEFAULT NOW(),
        closed_at   DATETIME                      -- NULL until SAR_FILED or NO_FILE
      )
    `);

    // Append-only log of every action on a case. detail holds a JSON payload
    // whose shape varies by action type (tool_call, recommendation, decision, flag).
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        alert_id   INT,
        actor      VARCHAR(32) NOT NULL,
        action     VARCHAR(32) NOT NULL,
        detail     JSON,
        created_at DATETIME DEFAULT NOW(),
        FOREIGN KEY (alert_id) REFERENCES alerts(id)
      )
    `);

    // Stores outcome and key factors from closed cases. The AI agent queries
    // this table via vector similarity to find precedents for new investigations.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS case_memory (
        id                    INT AUTO_INCREMENT PRIMARY KEY,
        alert_id              INT,
        typology              VARCHAR(64),
        description           TEXT,
        outcome               VARCHAR(16),   -- SAR_FILED or NO_FILE
        distinguishing_factor TEXT,
        FOREIGN KEY (alert_id) REFERENCES alerts(id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS investigation_snapshots (
        alert_id     INT PRIMARY KEY,
        tool_results JSON NOT NULL,   -- array of agent tool call outputs
        message      TEXT NOT NULL,   -- final recommendation text from the AI agent
        FOREIGN KEY (alert_id) REFERENCES alerts(id)
      )
    `);

    // MySQL 9.0 native VECTOR type. Stores 768-dim embeddings for KNN search
    // via VECTOR_DISTANCE() — replaces sqlite-vec's vec0 virtual table.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS case_embeddings (
        case_id    INT PRIMARY KEY,
        embedding  VECTOR(768) NOT NULL,
        FOREIGN KEY (case_id) REFERENCES case_memory(id)
      )
    `);
  } finally {
    conn.release();
  }
}

// MySQL doesn't support CREATE INDEX IF NOT EXISTS so we ignore duplicate key errors.
function ignoreExisting(err: { code: string }) {
  if (err.code !== "ER_DUP_KEYNAME") throw err;
}
