export type Service = {
  id: string;
  name: string;
  duration_minutes: number;
  price_kurus: number;
  price_is_starting_from: boolean;
};

export type StaffMember = { id: string; display_name: string; photo_id?: string | null; service_ids: string[] };

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
  /** Verified tick (v1.7): 3 completed bookings made through the app. */
  verified?: boolean;
  /** Average stars (v1.7); null until MIN_RATINGS customers have rated. */
  rating?: number | null;
  ratingCount?: number;
  audience: 'men' | 'women' | 'unisex';
  cancellationCutoffMinutes: number;
  paymentAtShop: boolean;
  photos: Photo[];
  posts: HaircutPost[];
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
  verified?: boolean;
  rating?: number | null;
  rating_count?: number;
};

/** A shop in "Salonlarım": a favourite, or one booked before. */
export type MyShop = Omit<ShopSummary, 'address'> & { favorite: boolean; last_visit: string | null };

export type Me = {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  gender?: 'male' | 'female' | null;
  /** Owner or co-owner of at least one salon (v1.7). */
  owns_shop?: boolean;
  /** Works at a salon in any role; only they can switch to business mode (v1.7). */
  has_business?: boolean;
  /** Verified tick (v1.7): 3 completed visits booked through the app. */
  verified?: boolean;
  portal?: 'customer' | 'staff' | 'owner';
  /** Our team: can open the admin panel (/yonetim, v1.7). */
  is_platform_admin?: boolean;
};

export type CustomerAppointment = {
  id: string;
  status: 'pending' | 'offered' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';
  starts_at: string;
  ends_at: string;
  deadline_at: string | null;
  /** The time asked for, when the salon offered another (v1.7). */
  offered_from: string | null;
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
  /** Ratings (v1.7): the stars given to this visit, and whether it can still be rated. */
  my_rating?: number | null;
  rateable?: boolean;
};

/** A salon's ratings (v1.7): stars only, with the salon's public reply. */
export type Rating = { id: string; stars: number; created_at: string; updated_at: string; reply: string | null; replied_at: string | null; customer: string };
export type RatingsSummary = { count: number; rating: number | null; distribution: number[]; ratings: Rating[] };

/** A shop on the Keşfet map. */
export type NearbyShop = Omit<ShopSummary, 'address'> & { latitude: number; longitude: number; distance_m: number };

/** A salon's photo of its work, tagged with a style ("Popüler kesimler", v1.7). */
export type HaircutPost = {
  id: string;
  style: string;
  style_name: string;
  caption: string | null;
  width: number;
  height: number;
  created_at: string;
  like_count: number;
};

export type PopularPost = HaircutPost & { shop_name: string; shop_slug: string; shop_verified?: boolean; district: string | null; city: string | null };

export type HaircutStyle = { key: string; name: string; audience: 'men' | 'women' };
