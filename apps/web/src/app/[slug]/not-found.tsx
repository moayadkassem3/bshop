import Link from 'next/link';

export default function ShopNotFound() {
  return (
    <div className="container narrow" style={{ padding: '48px 16px', textAlign: 'center' }}>
      <h1>Salon bulunamadı</h1>
      <p className="muted">Bu bağlantı hatalı olabilir ya da salon şu anda online randevu almıyor.</p>
      <Link href="/" className="btn btn-primary">
        Salon ara
      </Link>
    </div>
  );
}
