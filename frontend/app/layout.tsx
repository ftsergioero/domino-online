import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dominó cubano online',
  description: 'Doble nueve, en parejas, con tus amigos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
