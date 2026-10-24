import { formatTime } from '@/lib/format';
import type { CustomerAppointment } from '@/lib/types';

/** Status wording from handoff Appendix B. */
export function AppointmentStatus({ appointment: a }: { appointment: CustomerAppointment }) {
  switch (a.status) {
    case 'pending':
      return (
        <p>
          <span className="badge badge-warning">Salon onayı bekleniyor</span>
          {a.deadline_at && (
            <span className="muted" style={{ display: 'block', marginTop: 6, fontSize: 14 }}>
              Yanıt gelmezse otomatik onaylanır. Otomatik onay saati: {formatTime(a.deadline_at)}
            </span>
          )}
        </p>
      );
    case 'confirmed':
      return <span className="badge badge-success">Onaylandı</span>;
    case 'declined':
      return <span className="badge badge-danger">Salon kabul edemedi</span>;
    case 'cancelled':
      return (
        <span className="badge badge-muted">
          {a.cancel_reason === 'customer_late' ? 'Geç iptal edildi' : a.cancel_reason?.startsWith('customer') ? 'İptal ettiniz' : 'Salon iptal etti'}
        </span>
      );
    case 'completed':
      return <span className="badge badge-muted">Tamamlandı</span>;
    case 'no_show':
      return <span className="badge badge-danger">Gelmediniz</span>;
  }
}
