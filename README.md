# AML Investigation Agent

AI-powered case management for Anti-Money Laundering compliance. An agent autonomously investigates flagged transactions using institutional precedent from past cases, produces structured findings, and recommends a SAR filing or closure. The analyst reviews and makes the final call. Every action is logged to an immutable audit trail.

## Motivation

Fraud detection systems flag suspicious transactions, but over 90% are false positives. Analysts manually query history and write case notes for each alert — in isolation, with no structured access to how similar cases were resolved before. This creates two problems: high analyst workload and inconsistent decisions across cases.

This tool addresses both. The agent grounds every investigation in past case outcomes and produces an examination-ready audit trail regardless of whether a SAR is filed or not.

## Dataset

We use the [IBM AML HI-Small dataset](https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml) as synthetic data — ~3,400 accounts, ~111k transactions, labeled across 8 laundering typologies (`FAN-OUT`, `FAN-IN`, `CYCLE`, `SCATTER-GATHER`, `BIPARTITE`, `STACK`, `RANDOM`). The seed script filters to laundering accounts plus a clean sample and generates 373 case memory entries.

## Prerequisites

- Node.js
- [Ollama](https://ollama.com) with `qwen2.5:3b` pulled (`ollama pull qwen2.5:3b`)
- IBM AML HI-Small CSV files downloaded and placed in `src/data/`

## Installation

```bash
npm install
npm run seed   # parses IBM CSVs and builds src/data/aml.db
npm run dev    # http://localhost:3000
```

## How it works

1. An alert is created for a suspicious account (currently seeded from the IBM dataset)
2. The agent streams a multi-step investigation using four tools:
   - `get_transaction_history` — full account transaction history
   - `compute_velocity` — transaction frequency over a time window
   - `get_counterparty_history` — prior relationship with a counterparty
   - `find_similar_cases` — past cases with matching typology and their outcomes
3. The agent produces findings and a recommendation (File SAR / Close Case / Escalate / Request Info)
4. The analyst reviews the evidence, writes a rationale, and makes the final decision
5. Every agent action and analyst decision is appended to the audit trail

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (TypeScript) |
| Agent | LangChain + LangGraph |
| LLM | Ollama — `qwen2.5:3b` (local) |
| Database | SQLite via `better-sqlite3` |
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
│       └── alerts/                   # CRUD, audit, decide, snapshot endpoints
└── lib/
    ├── agent/
    │   ├── investigator.ts           # Agent class and streaming interface
    │   ├── tools.ts                  # Four LangChain tools
    │   ├── loader.ts                 # SqliteLoader — DB queries behind each tool
    │   ├── prompts.ts                # System prompt
    │   └── models.ts                 # Ollama model config
    └── db/
        ├── schema.ts                 # Table definitions
        ├── seed.ts                   # Parses IBM CSVs, populates DB
        └── repositories/             # alert.ts, case.ts, transaction.ts
```

## Database schema

```text
accounts                  — account and bank metadata
transactions              — full transaction records
alerts                    — flagged accounts: typology, description, status, closed_at
case_memory               — closed cases: outcome (SAR_FILED / NO_FILE), distinguishing factors
audit_trail               — immutable log of every agent action and analyst decision
investigation_snapshots   — tool results and agent message saved at case close
```

## To-dos

- [✅] **Embedding-based retrieval** — embed case memory entries and use vector search for `find_similar_cases`
- [✅] **SAR narrative drafting** — agent generates a draft FinCEN SAR narrative from audit trail entries for analyst review before filing
- [ ] **GraphRAG for case retrieval** — traverse the transaction network to retrieve past cases connected through shared accounts and counterparties, replacing text similarity with relational context
- [ ] **Agent self-correction loop** — add a multi-pass reasoning loop where the agent re-examines earlier conclusions when contradictory evidence is found
- [ ] **Team workflow simulation** — analyst roles (junior investigates, senior approves SAR filings), case assignment, and peer review requests logged to the audit trail
