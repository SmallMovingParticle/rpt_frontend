export type LeadStage = 'new' | 'cadence' | 'attention' | 'booked' | 'closed';

export type Lead = {
  id: string;
  display_id: string;
  full_name: string;
  phone: string | null;
  email?: string | null;
  source: string;
  status: string;
  stage: LeadStage;
  cadence_state: string;
  needs_review: boolean;
  review_reason: string | null;
  next_event_id: number | null;
  next_event_status?: string | null;
  next_step: string | null;
  next_channel: string | null;
  next_scheduled_for: string | null;
  created_at: string;
  last_contacted_at: string | null;
  location?: string;
  cadence_progress?: number;
  cadence_total?: number;
  owner?: string;
  date_of_birth?: string;
  referred_by?: string;
  lead_type?: 'Physical Therapy' | 'Wellness';
  is_test?: boolean;
};

export type LeadCreateInput = {
  idempotency_key: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string;
  referred_by: string | null;
  lead_type: 'Physical Therapy' | 'Wellness';
  location: string;
  owner: string;
  contact_consent: true;
};

export type Metrics = {
  total_leads: number;
  messages_sent: number;
  messages_delivered: number;
  messages_failed: number;
  messages_pending: number;
  messages_delivery_rate: number | null;
  calls_completed: number;
  calls_completion_rate: number | null;
  calls_reached_rate: number | null;
  review_rate: number | null;
  booked_rate: number | null;
};

export type Snapshot = {
  counts: Record<LeadStage, number>;
  leads: Lead[];
  appointments: Array<Record<string, unknown>>;
  cadence: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  system: Record<string, number>;
  metrics?: Metrics;
  generated_at?: string;
};

export type LeadDetail = {
  lead: Record<string, unknown> & { id: string; full_name: string; display_id: string };
  events: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  calls: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
  message_overrides: Array<Record<string, unknown>>;
};

export const emptySnapshot: Snapshot = {
  counts: { new: 0, cadence: 0, attention: 0, booked: 0, closed: 0 },
  leads: [],
  appointments: [],
  cadence: [],
  templates: [],
  providers: [],
  system: { provider_queue: 0, handoff_queue: 0, unknown_events: 0, review_queue: 0 },
};
