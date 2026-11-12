export type Plan = { id: string; name: string; maxStaff: number; monthlyPriceKurus: number };

export type AdminSalon = {
  id: string;
  slug: string;
  name: string;
  district: string | null;
  city: string | null;
  audience: 'men' | 'women' | 'unisex';
  created_at: string;
  checked_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  subscription_status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  current_period_end: string | null;
  grace_until: string | null;
  visible: boolean;
  seats: number;
  plan: Plan | null;
  rating: number | null;
  rating_count: number;
  owner_name: string | null;
  owner_phone: string | null;
  bookings_30d: number;
  views_30d: number;
  open_request_at: string | null;
  last_payment_at: string | null;
};

export type SalonDetail = AdminSalon & {
  address: string | null;
  phone: string | null;
  members: { display_name: string; role: string; owner_label: string | null; bookable: boolean; active: boolean; phone: string }[];
  payments: { id: string; amount_kurus: number; months: number; method: string; note: string | null; period_end: string; created_at: string; recorded_by: string | null }[];
  requests: { id: string; plan_id: string | null; created_at: string; handled_at: string | null; phone: string | null }[];
};

export type Overview = {
  salons: Record<'total' | 'live' | 'trial' | 'paying' | 'late' | 'hidden' | 'suspended' | 'unchecked' | 'new_7d' | 'new_30d', number>;
  /** Subscribed salons: active, or late within their grace (v1.7). */
  subscribers: { total: number; late: number; byPlan: { name: string; count: number }[] };
  mrrKurus: number;
  payments: { this_month: number; last_month: number };
  bookings: Record<'total' | 'completed' | 'no_show' | 'cancelled', number>;
  customers: { total: number; new_30d: number };
  ratings: { count: number; average: number | null };
  open: { subscriptions: number; quotes: number; payments: number };
};
