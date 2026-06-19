import Link from 'next/link';
import { ShoppingBag, WifiOff } from 'lucide-react';
import { BrandLogo } from '@/components/brand';

export default function StoreOfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70">
        <div className="flex justify-center">
          <BrandLogo subtitle="Catalogo Online" />
        </div>

        <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <WifiOff className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-xl font-black text-slate-950">Catalogo sem conexao</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Voce esta sem conexao. Alguns produtos, precos e disponibilidades podem nao estar atualizados.
        </p>

        <Link
          href="/store"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-700"
        >
          <ShoppingBag className="h-4 w-4" />
          Tentar novamente
        </Link>
      </section>
    </main>
  );
}
