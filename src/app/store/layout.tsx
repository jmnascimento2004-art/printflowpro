import type { Metadata } from 'next';

export const metadata: Metadata = {
  manifest: '/store/manifest.webmanifest'
};

export default function StoreLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
