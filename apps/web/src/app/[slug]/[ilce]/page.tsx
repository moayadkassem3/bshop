import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlacePage, placeMetadata } from '@/components/places/PlacePage';
import { districtBySlug, provinceBySlug } from '@/lib/places';

type Props = { params: Promise<{ slug: string; ilce: string }> };

/** /istanbul/avcilar: every salon in a district (v1.7). */
async function place(params: Props['params']) {
  const { slug, ilce } = await params;
  const province = provinceBySlug(slug);
  const district = province ? districtBySlug(province, ilce) : null;
  return province && district ? { province, district } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await place(params);
  return p ? placeMetadata(p) : { title: 'Sayfa bulunamadı' };
}

export default async function DistrictPage({ params }: Props) {
  const p = await place(params);
  if (!p) notFound();
  return <PlacePage {...p} />;
}
