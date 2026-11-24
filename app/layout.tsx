import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Baca Aksara Jawa · ꦲꦤꦕꦫꦏ',
  description: 'Klasifikasi aksara Jawa tunggal dan pembacaan deretan aksara (OCR) dari gambar tulisan tangan.',
};

export const viewport: Viewport = { themeColor: '#1b1f3b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Gloock&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Noto+Sans+Javanese:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
