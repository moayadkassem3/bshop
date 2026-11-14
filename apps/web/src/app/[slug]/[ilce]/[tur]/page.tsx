import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlacePage, placeMetadata } from '@/components/places/PlacePage';
import { districtBySlug, provinceBySlug, SALON_TYPES, type SalonType } from '@/lib/places';

type Props = { params: Promise<{ slug: string; ilce: string; tur: string }> };

/** /istanbul/avcilar/erkek-kuaforu: one type of salon in a district (v1.7). */
async function place(params: Props['params']) {
  const { slug, ilce, tur } = await params;
  const province = provinceBySlug(slug);
  const district = province ? districtBySlug(province, ilce) : null;
  const type = tur in SALON_TYPES ? (tur as SalonType) : null;
  return province && district && type ? { province, district, type } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await place(params);
  return p ? placeMetadata(p) : { title: 'Sayfa bulunamadı' };
}

export default async function DistrictTypePage({ params }: Props) {
  const p = await place(params);
  if (!p) notFound();
  return <PlacePage {...p} />;
}
