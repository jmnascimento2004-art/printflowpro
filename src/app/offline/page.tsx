import { WifiOff } from 'lucide-react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-4 py-10 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-200/70">
        <div className="flex justify-center">
          <BrandLogo subtitle="APP instalado" />
        </div>

        <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1D35C9]">
          <WifiOff className="h-7 w-7" />
        </div>

        <h1 className="mt-5 text-xl font-black text-slate-950">Você está sem conexão</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Você está sem conexão com a internet. Algumas informações podem não estar atualizadas.
          Verifique sua conexão e tente novamente.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[#1D35C9] px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#172ba3]"
        >
          Tentar novamente
        </Link>
      </section>
    </main>
  );
}
