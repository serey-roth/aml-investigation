# AML Investigation Agent with Case Memory

## Problem

Fraud detection systems flag suspicious transactions, but more than 90% of alerts are false positives (McKinsey & Company, [The investigator-centered approach to financial crime](https://www.mckinsey.com/capabilities/risk-and-resilience/our-insights/the-investigator-centered-approach-to-financial-crime-doing-what-matters)). Analysts spend most of their time manually querying transaction history, reviewing account behavior, and writing case notes before deciding whether to file a Suspicious Activity Report (SAR) or close the case. The quality and consistency of those decisions — and their documentation — varies significantly across analysts and cases.

The deeper problem is not just alert volume. It is that each case is investigated in isolation. An analyst reviewing a flagged transaction today has no structured way to know how similar cases were handled before, what evidence changed the outcome, or how to produce a documentation record that will hold up under regulatory examination.

## Design Evolution

Our initial plan was a simpler system: use KNN to classify suspicious transactions based on similarity to historical ones, then use an LLM to generate a human-readable summary explaining the classification. The LLM was essentially a text formatter — it narrated the KNN output but did not do meaningful investigative work.

After examining how real AML tools operate and where the actual pain points are in compliance workflows, we identified two things the original design missed:

**Investigation notes are not enough.** Real AML compliance requires audit trails — immutable, examination-ready records of every action taken on a case, by both the system and the analyst. This matters for both SAR filings and no-file decisions. Regulatory examiners assess both outcomes with equal scrutiny.

**Cases should not be investigated in isolation.** A system that treats each alert as a fresh start ignores institutional knowledge. How similar cases were handled — what evidence changed the outcome, whether a SAR was filed — is directly relevant to the current decision. Grounding investigations in past case outcomes improves consistency and produces more defensible documentation.

The result is a meaningfully different system: an AI investigation agent that actively reasons through a case using institutional precedent, rather than an LLM that passively describes a classifier's output.

## Project Overview

We are building an AML investigation agent backed by a relational database. When a transaction is flagged as suspicious, the agent autonomously investigates it — querying transaction history, computing behavioral indicators, and retrieving similar past cases with their outcomes. It produces an audit trail documenting every step it took and recommends whether a SAR should be filed or the case closed, with explicit reasoning grounded in institutional precedent.

The human analyst reviews the agent's work and makes the final decision. Their decision is also recorded in the audit trail.

### Main Architecture

The system has four main components:

1. **Database**: stores accounts, transactions, alerts, case memory, and audit trails
2. **Detection trigger**: computes fraud indicators, embeds them as feature vectors, and uses FAISS to flag transactions whose nearest historical neighbors are predominantly fraudulent
3. **Investigation agent**: an LLM that uses tools to investigate flagged transactions and retrieve similar past cases
4. **Audit trail**: an immutable, structured record of every agent action and every human decision

### Dataset

We use the [IBM AML Transaction Dataset (HI-Small)](https://www.kaggle.com/datasets/ealtman2019/ibm-transactions-for-anti-money-laundering-aml) as our synthetic data.

The dataset contains 5 million transactions across 8 laundering typologies (fan-out, fan-in, cycle, scatter-gather, bipartite, stack, random). We filter to accounts involved in labeled laundering patterns plus a sample of clean accounts, resulting in ~3,400 accounts, ~111,000 transactions, and 373 seeded case memory entries stored in SQLite.

### Database Schema

```text
accounts         — account information and customer profile
transactions     — full transaction records seeded from the dataset (references accounts)
alerts           — flagged transactions with risk score and review status (references transactions)
case_memory      — closed past cases with outcomes (SAR filed / no-file) and analyst decisions (references alerts)
audit_trail      — immutable log of every agent action and human action per alert (references alerts)
```

`case_memory` is the key addition over a standard case management schema. Every closed alert — whether a SAR was filed or not — is written to case memory with its outcome and becomes retrievable context for future investigations.

`audit_trail` entries record: actor (agent or analyst), action taken, evidence or reasoning, and timestamp. This produces an examination-ready record for every case.

### Tech Stack

- **Language**: TypeScript
- **Framework**: Next.js
- **Agent framework**: LangChain
- **Database**: SQLite (via better-sqlite3)
- **Similarity search**: FAISS (planned)
- **LLM**: Ollama (local, qwen2.5:3b)

### Detection Method

For each new transaction, the system computes a set of fraud indicators using SQL queries:

- Transaction velocity (number of transactions in recent time windows)
- Unusual transaction amount relative to account history
- New or high-risk merchant usage
- Rapid withdrawals or transfers
- Abnormal transaction time

These indicators are not evaluated independently as alert triggers. Instead, they are assembled into a feature vector and searched against historical transactions using FAISS (Facebook AI Similarity Search). FAISS retrieves the nearest neighbors via approximate nearest neighbor (ANN) search. If the majority of neighbors are labeled fraudulent, an alert is created.

The same indicators then become the investigation signals the agent reasons about during case review. FAISS also powers the agent's `find_similar_cases()` tool, making it the shared similarity layer for both detection and investigation.

### Investigation Agent

The agent is an LLM that runs when an alert is created. It does not predict fraud — it investigates and documents. The agent has access to the following tools:

- `get_transaction_history(account_id)` — retrieves full account transaction history
- `compute_velocity(account_id, window)` — computes transaction frequency over a time window
- `get_counterparty_history(account_id, counterparty_id)` — checks whether a counterparty has appeared before for this account
- `find_similar_cases(pattern)` — retrieves the most similar past cases from case memory, with their outcomes

The agent runs a multi-step investigation: it gathers evidence, retrieves precedents from case memory, identifies what factors distinguish this case from similar ones, and produces a final recommendation — SAR or no-file — with documented reasoning and precedent citations.

The agent does not make the final decision. It produces the record. The analyst decides.

### Audit Trail

Every alert produces two types of audit trail entries:

#### Agent entries — logged automatically during investigation

- What the agent queried and what it found
- Which past cases it retrieved and how they compared
- How the agent revised its assessment as evidence accumulated
- The final recommendation and reasoning

#### Analyst entries — logged when the analyst acts

- Review timestamp and analyst ID
- Final decision (SAR filed / case closed)
- Any override of the agent's recommendation with documented rationale

This produces a complete, examination-ready case record regardless of outcome — including no-file decisions, which require the same rigor as filings under regulatory examination.

### Test Cases

We will test the following real-world fraud patterns:

- Structuring: multiple cash deposits just below reporting thresholds over a short period
- Account takeover: new device registration, address change, then a large outbound transfer within 48 hours
- Unusual transaction times relative to account history
- New merchant at high-risk category after long dormancy
- Abnormal transaction amounts relative to account average

For each test case, we will verify that the agent retrieves relevant precedents, produces accurate reasoning, and generates a complete audit trail.

### Evaluation Plan

We will evaluate the system on four dimensions:

#### Detection accuracy

- Precision and recall of the FAISS-based alert trigger against labeled test cases
- False positive rate: how often does the system flag transactions that are not fraudulent?

#### Case memory retrieval quality

- Are the cases returned by `find_similar_cases()` genuinely similar in meaningful ways?
- Do retrieved cases share the same fraud typology as the case under investigation?
- Poor retrieval directly undermines agent reasoning, so this is evaluated independently

#### Investigation quality

- Does the agent correctly identify the distinguishing factors between the current case and retrieved precedents?
- Does the SAR or no-file recommendation align with expected outcomes across test cases?
- Does the agent's reasoning change appropriately when mitigating factors are present?

#### Audit trail completeness

- Does the audit trail record every agent action, query, and finding?
- Does it capture the analyst's final decision and any override rationale?
- Would the record be sufficient for a regulatory examiner reviewing the case without any additional context?

### Future Exploration

If time permits, we will explore:

- **Analyst dashboard**: alert queue, case status tracking, filtering by risk score and status
- **SAR narrative drafting**: agent generates a draft SAR narrative from the audit trail for analyst review
- **Agent self-correction**: a formal multi-pass reasoning loop where the agent explicitly re-examines and challenges its earlier conclusions when contradictory evidence is found, rather than simply logging revisions
