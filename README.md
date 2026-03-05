# AI-Assisted Fraud Detection Case Management System

## Problem

Fraud detection systems flag suspicious transactions, but they also create a large number of alerts, most of which tend to be false positives. Each alert must be manually reviewed by a fraud analyst, who spends most of their time querying transaction history, reviewing account behavior, and writing investigation notes before deciding whether to approve or block a transaction.

The problem is how to make the review process faster and more efficient. Our goal is to simulate an internal banking tool that supports analysts by automatically retrieving similar transactions and generating an explanation for why a transaction might be fraudulent.

## Project Overview

We plan to build a fraud detection case management system that is backed by a relational database. The system will store banking transactions and use similarity search (k-nearest neighbors) to classify whether a new transaction is fraudulent based on historical behavior/patterns. An LLM will then generate a human-readable summary explaining the decision.

### Main Architecture

The project has 3 main components:

1. Database system: store transactions, features, alerts, case records.
2. Similarity-based classifier: retrieve similar past transactions and predict fraud likelihood.
3. LLM investigator: generate an investigation note using retrieval results

### Dataset

We will use the [USA banking transaction dataset (2023 - 2024)](https://www.kaggle.com/datasets/pradeepkumar2424/usa-banking-transactions-dataset-2023-2024) as our synthetic data.

Each transaction record in this dataset includes transaction amount, date/time, transaction type, merchant information, and channel.

### Database schema

Our relational schema will include:
● accounts: account information
● transactions: transaction records (will be seeded with the dataset)
● alerts: flagged suspicious transactions
● case notes: LLM-generated summary and reasoning

### Fraud detection method

We’re not training a machine learning model for this project. Instead, we use case-based reasoning:

1. For a new transaction, we derive potential fraud indicators using SQL queries.
2. We find the k-most similar past transactions using k-nearest neighbors (KNN). We will also have to experiment and find the most optimal k.
3. The new transaction is classified based on the majority label of the retrieved labels, i.e., if most neighbor transactions are normal, then it’s possibly a normal one too.

Potential fraud indicators include:
● Transaction speed (number of transactions in recent time windows)
● Unusual transaction amount compared to average
● New merchant usage
● Rapid withdrawals or transfers
● Abnormal spending time

### LLM component

We’re not using an LLM to predict fraud. Instead, it will be used to generate investigation notes or summaries based on the k-most similar transactions and computed fraud indicators we’ve found.

### Test cases

We will be testing real-world fraud behaviors:
● rapid small purchases followed by a large purchase
● unusual transaction times
● suspicious merchant channels
● abnormal spending amounts, etc.

### Evaluation Plan

We will evaluate the system based on the following criteria:
● How accurate is the classification?
● How fast does it take to retrieve similar transactions?
● How useful are the generated summaries?

We will also do a live demo showing how an analyst reviews a flagged transaction.

### Future exploration

We’re aiming for a working system that simulates the real-world auditing workflow for fraudulent banking transactions. That said, if we have time, we’ll explore more features such as:
● Analyst dashboard: case status tracking, filtering, etc.
● Investigator agent: AI agent that automatically fetches supporting evidence (transaction history, merchant info, similar past cases), drafts notes and recommends actions for analyst review.
