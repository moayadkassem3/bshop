import type { Metadata } from 'next';
import { DeleteAccount } from './DeleteAccount';

export const metadata: Metadata = { title: 'Hesabı sil', description: 'Hesabınızı ve kişisel verilerinizi nasıl silebileceğiniz.' };

export default function DeleteAccountPage() {
  return <DeleteAccount />;
}
