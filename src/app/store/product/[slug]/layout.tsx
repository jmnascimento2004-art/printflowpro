import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPublicProductPath } from '@/lib/store/product-permalink';
import { resolvePublicStoreProduct } from '@/lib/store/resolve-public-store-product.server';
import { stripRichTextHtml } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
};

async function getHost() {
  const headerStore = await headers();
  return headerStore.get('x-forwarded-host') || headerStore.get('host');
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await resolvePublicStoreProduct(await getHost(), slug);
  if (!product) return { title: 'Produto não encontrado', robots: { index: false, follow: false } };

  const path = getPublicProductPath(product.slug);
  const canonical = path ? new URL(path, product.storeOrigin).toString() : product.storeOrigin;
  const description = stripRichTextHtml(product.description).slice(0, 160) || `Configure ${product.name} no catálogo online.`;

  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title: product.name,
      description,
      images: product.imageUrl ? [{ url: product.imageUrl, alt: product.name }] : undefined
    }
  };
}

export default async function PublicProductLayout({ params, children }: Props) {
  const { slug } = await params;
  const product = await resolvePublicStoreProduct(await getHost(), slug);
  if (!product) notFound();
  return children;
}
