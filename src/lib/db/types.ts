export interface AccountDb {
  account_id: string;
  bank_id: string;
  bank_name: string;
  entity_name: string;
}

export interface TransactionDb {
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

export interface TransactionAmountDb {
  timestamp: string;
  amount_paid: number;
}

export interface CaseDb {
  id: number;
  alert_id: number;
  typology: string;
  description: string;
  outcome: string;
  distinguishing_factor: string;
}

export interface AuditEntryDb {
  id: number;
  alert_id: number;
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
}


export interface AlertDb {
  id: number;
  account_id: string;
  typology: string;
  description: string;
  status: string;
  created_at: string;
}
