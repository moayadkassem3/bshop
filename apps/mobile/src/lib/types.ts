export type Portal = 'customer' | 'staff' | 'owner';

export type Me = {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  gender?: 'male' | 'female' | null;
  owns_shop?: boolean;
  has_business?: boolean;
  verified?: boolean;
  portal?: Portal;
};

export type AppointmentStatus = 'pending' | 'offered' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';

export type CustomerAppointment = {
  id: string;
  status: AppointmentStatus;
  starts_at: string;
  ends_at: string;
  deadline_at: string | null;
  offered_from: string | null;
  guest_name: string | null;
  total_price_kurus: number;
  price_is_starting_from: boolean;
  cancel_reason: string | null;
  shop_name: string;
  shop_slug: string;
  shop_address: string | null;
  cancellation_cutoff_minutes: number;
  staff_name: string;
  services: { name: string; durationMinutes: number; priceKurus: number }[] | null;
  my_rating?: number | null;
  rateable?: boolean;
};

export type BusinessShop = {
  id: string;
  name: string;
  slug: string;
  member_id: string;
  role: 'owner' | 'staff';
  subscription_status: 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
  current_period_end: string | null;
  grace_until: string | null;
  visible: boolean;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  seats: number;
  plan_id: string | null;
};

export type ShopAppointment = {
  id: string;
  staff_id: string;
  staff_name: string;
  status: AppointmentStatus;
  source: string;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  customer_phone: string | null;
  guest_name: string | null;
  deadline_at: string | null;
  offered_from: string | null;
  cancel_reason: string | null;
  total_price_kurus: number;
  price_is_starting_from: boolean;
  customer_verified?: boolean;
  services: { name: string; durationMinutes: number }[] | null;
};

export type NearbyShop = {
  slug: string;
  name: string;
  district: string | null;
  city: string | null;
  audience: 'men' | 'women' | 'unisex';
  latitude: number;
  longitude: number;
  distance_m: number;
  verified?: boolean;
  cover_photo_id: string | null;
  rating?: number | null;
  rating_count?: number;
};

export type ShopProfile = {
  slug: string;
  name: string;
  rating: number | null;
  ratingCount: number;
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
  verified?: boolean;
  photos: { id: string }[];
  openingHours: { weekday: number; open: string | null; close: string | null }[];
  services: { id: string; name: string; duration_minutes: number; price_kurus: number; price_is_starting_from: boolean }[];
  staff: { id: string; display_name: string }[];
};

export const AUDIENCE: Record<string, string> = { men: 'Erkek kuaförü', women: 'Kadın kuaförü', unisex: 'Kuaför' };
