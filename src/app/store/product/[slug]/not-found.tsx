import Link from 'next/link';

export default function PublicProductNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-black text-slate-900">Produto não encontrado</h1>
        <p className="mt-2 text-sm text-slate-500">Este produto não está disponível neste catálogo.</p>
        <Link href="/store" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white">Voltar ao catálogo</Link>
      </section>
    </main>
  );
}
