import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rimba — Survival Town 2.5D',
  description:
    'Game web 2.5D isometrik multiplayer real-time dengan sistem survival-town, KTP warga, panen resource, pembangunan, pasar, dan AFK.',
  openGraph: {
    title: 'Rimba — Survival Town 2.5D',
    description:
      'Game web 2.5D isometrik multiplayer real-time dengan sistem survival-town, KTP warga, panen resource, pembangunan, pasar, dan AFK.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rimba — Survival Town 2.5D',
    description:
      'Game web 2.5D isometrik multiplayer real-time dengan sistem survival-town, KTP warga, panen resource, pembangunan, pasar, dan AFK.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="id">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
