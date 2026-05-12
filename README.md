# AML Investigation Agent

AI-powered case management for Anti-Money Laundering compliance. An agent autonomously investigates flagged transactions using institutional precedent from past cases, produces structured findings, and recommends a SAR filing or closure. The analyst reviews and makes the final call. Every action is logged to an immutable audit trail.

## Motivation

Fraud detection systems flag suspicious transactions, but over 90% are false positives. Analysts manually query history and write case notes for each alert — in isolation, with no structured access to how similar cases were resolved before. This creates two problems: high analyst workload and inconsistent decisions across cases.

This tool addresses both. The agent grounds every investigation in past case outcomes and produces an examination-ready audit trail regardless of whether a SAR is filed or not.

## Dataset

We use the [IBM AML HI-Small dataset](https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml) as synthetic data — ~3,400 accounts, ~111k transactions, labeled across 8 laundering typologies (`FAN-OUT`, `FAN-IN`, `CYCLE`, `SCATTER-GATHER`, `BIPARTITE`, `STACK`, `RANDOM`). The seed script filters to laundering accounts plus a clean sample and generates 373 case memory entries.

## Prerequisites

| Requirement | Version | Notes |
| ----------- | ------- | ----- |
| Node.js | 18+ | |
| MySQL | 9.0 | |
| Ollama | latest | `ollama pull qwen2.5:3b && ollama pull nomic-embed-text` |
| IBM AML HI-Small CSVs | — | Place in `src/data/` |

## Environment variables

Copy `.env.example` to `.env.local` and fill in your values.

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Start MySQL and create the database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS aml_cases;"

# 3. Seed the database (parses IBM CSVs, creates schema, inserts data)
npm run seed

# 4. Pull the required Ollama models
ollama pull qwen2.5:3b
ollama pull nomic-embed-text

# 5. Start the dev server
npm run dev    # http://localhost:3000
```

## Available scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run seed` | Parse IBM CSVs and populate MySQL |
| `npm run db:check` | Run database test queries (see below) |
| `npm run lint` | Run ESLint |

## Database test queries

After seeding, verify data integrity, index performance, and relational correctness:

```bash
npm run db:check
```

| Test | Query | What it checks |
| ---- | ----- | -------------- |
| TC-01 | `SELECT COUNT(*) FROM transactions` | Row count — fails if the table is empty |
| TC-02 | Account lookup with `IGNORE INDEX` vs `USE INDEX` | B-tree index performance, prints both latencies |
| TC-03 | `transactions JOIN accounts ON from_account = account_id` | Referential integrity between transactions and accounts |
| TC-04 | `alerts JOIN case_memory ON alert_id` | Case memory entries for closed alerts |

TC-04 prints a warning instead of failing if no cases have been closed yet.

## How it works

1. An alert is created for a suspicious account (seeded from the IBM dataset)
2. The agent streams a multi-step investigation using four tools:
   - `get_transaction_history` — full account transaction history
   - `compute_velocity` — transaction frequency over a time window
   - `get_counterparty_history` — prior relationship with a counterparty
   - `find_similar_cases` — past cases with matching typology and their outcomes
3. The agent produces findings and a recommendation (File SAR / Close Case / Escalate / Request Info)
4. The analyst reviews the evidence, writes a rationale, and makes the final decision
5. If the decision is SAR Filed, the analyst can generate a draft FinCEN SAR narrative on demand
6. Every agent action and analyst decision is appended to an immutable audit trail

## Tech stack

| Layer | Choice |
| ----- | ------ |
| Framework | Next.js (TypeScript) |
| Agent | LangChain + LangGraph |
| LLM | Ollama — `qwen2.5:3b` (local) |
| Embeddings | Ollama — `nomic-embed-text` (local) |
| Database | MySQL 9.0 via `mysql2` |
| Dataset | IBM AML HI-Small (~111k transactions, 8 typologies) |

## Project structure

```text
src/
├── app/
│   ├── page.tsx                      # Alert queue (active / closed, paginated)
│   ├── analytics/page.tsx            # Decision stats by typology
│   ├── alerts/[id]/page.tsx          # Investigation view + decision panel
│   └── api/
│       ├── investigate/route.ts      # Streams agent events via SSE
│       └── alerts/[id]/
│           ├── route.ts              # Alert fetch
│           ├── audit/route.ts        # Audit trail fetch
│           ├── decide/route.ts       # Submit analyst decision
│           ├── graph/route.ts        # Transaction network graph
│           ├── sar/route.ts          # SAR narrative generation (Ollama SSE)
│           └── snapshot/route.ts     # Investigation snapshot fetch
└── lib/
    ├── agent/
    │   ├── investigator.ts           # Agent class and streaming interface
    │   ├── tools.ts                  # Four LangChain tools
    │   ├── loader.ts                 # MysqlLoader — DB queries behind each tool
    │   ├── prompts.ts                # System prompt + SAR prompt builder
    │   └── models.ts                 # Model config
    └── db/
        ├── client.ts                 # mysql2 connection pool
        ├── schema.ts                 # Table definitions (CREATE IF NOT EXISTS)
        ├── seed.ts                   # Parses IBM CSVs, populates DB
        ├── check.ts                  # Test queries (TC-01 – TC-04)
        ├── types.ts                  # Raw DB row types (snake_case)
        └── repositories/
            ├── alert.ts              # Alert CRUD, status transitions, close
            ├── audit.ts              # Audit trail insert/fetch
            ├── case.ts               # Case memory
            └── transaction.ts        # Transaction history and velocity queries
```

## Database schema

```text
accounts                  — account and bank metadata
transactions              — full IBM AML transaction records with laundering labels
alerts                    — flagged accounts: typology, description, status, closed_at
case_memory               — closed cases: outcome (SAR_FILED / NO_FILE), distinguishing factors
audit_trail               — append-only log of every agent tool call and analyst decision
investigation_snapshots   — tool results and agent message saved at case close for replay
case_embeddings           — 768-dim vectors for case_memory rows (MySQL 9 VECTOR type)
```

## To-dos

- [✅] **Embedding-based retrieval** — embed case memory entries and use vector search for `find_similar_cases`
- [✅] **SAR narrative drafting** — on-demand FinCEN SAR narrative from audit trail entries
- [ ] **GraphRAG for case retrieval** — traverse the transaction network to retrieve past cases connected through shared accounts and counterparties, replacing text similarity with relational context
- [ ] **Agent self-correction loop** — multi-pass reasoning where the agent re-examines earlier conclusions when contradictory evidence is found
- [ ] **Team workflow simulation** — analyst roles (junior investigates, senior approves), case assignment, and peer review logged to the audit trail
