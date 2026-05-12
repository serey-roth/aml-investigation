import { createPool } from "mysql2/promise";

// Connection pool — reused across requests. Pool size defaults to 10.
const pool = createPool({
  host:        process.env.MYSQL_HOST     ?? "localhost",
  port:        Number(process.env.MYSQL_PORT ?? 3307),
  database:    process.env.MYSQL_DATABASE ?? "aml_cases",
  user:        process.env.MYSQL_USER     ?? "root",
  password:    process.env.MYSQL_PASSWORD ?? "password",
  dateStrings: true, // return DATETIME as "YYYY-MM-DD HH:MM:SS" strings, not Date objects
});

export default pool;
