import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SmartShopper admin',
  description: 'Internal review queue and catalog tools.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
