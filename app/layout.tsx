import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { 
  title: 'Capital360IPO | IPO, Stocks & Market News', 
  description: 'IPO updates, stock market insights and financial news.' 
};

export default function RootLayout({ 
  children 
}: Readonly<{ children: React.ReactNode }>) { 
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  ); 
}
