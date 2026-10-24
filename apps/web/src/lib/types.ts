export type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_kurus: number;
  price_is_starting_from: boolean;
};

export type StaffMember = { id: string; display_name: string; service_ids: string[] };

export type ShopProfile = {
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  audience: 'men' | 'women' | 'unisex';
  cancellationCutoffMinutes: number;
  paymentAtShop: boolean;
  services: Service[];
  staff: StaffMember[];
};

export type Slot = {
  startsAt: string;
  instantConfirmation: boolean;
  staff: { id: string; durationMinutes: number }[];
};

export type Availability = { date: string; totalPriceKurus: number; priceIsStartingFrom: boolean; slots: Slot[] };

export type ShopSummary = {
  slug: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  audience: string;
};

export type Me = { id: string; phone: string; first_name: string | null; last_name: string | null };

export type CustomerAppointment = {
  id: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';
  starts_at: string;
  ends_at: string;
  deadline_at: string | null;
  guest_name: string | null;
  total_price_kurus: number;
  price_is_starting_from: boolean;
  confirmed_via: string | null;
  cancel_reason: string | null;
  shop_name: string;
  shop_slug: string;
  shop_address: string | null;
  cancellation_cutoff_minutes: number;
  staff_name: string;
  services: { name: string; durationMinutes: number; priceKurus: number }[];
};
