export type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_kurus: number;
  price_is_starting_from: boolean;
};

export type StaffMember = { id: string; display_name: string; service_ids: string[] };

export type Photo = { id: string; width: number; height: number };

export type OpeningHours = { weekday: number; open: string | null; close: string | null };

export type ShopProfile = {
  slug: string;
  name: string;
  about: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  latitude: number | null;
  longitude: number | null;
  audience: 'men' | 'women' | 'unisex';
  cancellationCutoffMinutes: number;
  paymentAtShop: boolean;
  photos: Photo[];
  openingHours: OpeningHours[];
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
  district: string | null;
  city: string | null;
  audience: string;
  cover_photo_id: string | null;
};

/** A shop in "Salonlarım": a favourite, or one booked before. */
export type MyShop = Omit<ShopSummary, 'address'> & { favorite: boolean; last_visit: string | null };

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
