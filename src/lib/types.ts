export const ACTIVE_STATUSES = ["open", "escalated", "rfi"] as const;
const ALERT_STATUSES = [...ACTIVE_STATUSES, "closed"] as const;
export type AlertStatus = typeof ALERT_STATUSES[number];

export interface Alert {
  id: number;
  accountId: string;
  typology: string;
  description: string;
  status: AlertStatus;
  createdAt: string;
}

export interface Account {
  accountId: string;
  bankId: string;
  bankName: string;
  entityName: string;
}

export interface Transaction {
  timestamp: string;
  fromBank: string;
  fromAccount: string;
  toBank: string;
  toAccount: string;
  amountPaid: number;
  paymentCurrency: string;
  amountReceived: number;
  receivingCurrency: string;
  paymentFormat: string;
  isLaundering: boolean;
}


export interface Case {
  id: number;
  alertId: number;
  typology: string;
  description: string;
  outcome: string;
  distinguishingFactor: string;
}

export type CaseOutcome = "SAR_FILED" | "NO_FILE";

export interface AuditEntry {
  id: number;
  alertId: number;
  actor: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export interface TypologyStats {
  typology: string;
  total: number;
  sarFiled: number;
  noFile: number;
  unknown: number;
  agentMatchCount: number;
  agentTotalCount: number;
  agreementRate: number;
  falsePositiveRate: number;
  avgDecisionMs: number;
}

export interface AnalyticsData {
  totalAlerts: number;
  totalClosed: number;
  totalOpen: number;
  overallSarRate: number;
  overallFalsePositiveRate: number;
  overallAgreementRate: number;
  byTypology: TypologyStats[];
}

export type InvestigationEvent =
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; output: string }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };
