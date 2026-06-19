'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { 
  Layers, 
  ArrowRight, 
  ShoppingBag, 
  LayoutGrid, 
  TrendingUp, 
  Calculator, 
  Users 
} from 'lucide-react';

export default function LandingPortalPage() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.document.documentElement.classList.remove('dark');
    window.document.documentElement.classList.add('light');
  }, []);

  const features = [
    { title: 'Precificação por m² / Linear', description: 'Calculadora integrada considerando matéria-prima, comissão, desperdício, impostos e tempo operacional.', icon: Calculator },
    { title: 'Controle de Pedidos Kanban', description: 'Arraste os cartões de pedido em 10 status automatizados integrados com produção e estoque.', icon: LayoutGrid },
    { title: 'Cadastro de Clientes', description: 'Perfis de clientes com histórico de compras, etiquetas coloridas, notas comerciais e WhatsApp.', icon: Users },
    { title: 'Caixa & Fluxo Financeiro', description: 'Contas a receber, contas a pagar, parcelamentos, pagamentos parciais e Pix com QR Code demonstrativo.', icon: TrendingUp },
    { title: 'Orçamentos em PDF', description: 'Gere orçamentos com múltiplos itens de forma rápida e exporte faturas limpas e prontas para impressão.', icon: Layers },
    { title: 'Loja Virtual Integrada', description: 'Catálogo de produtos onde clientes podem simular preços por dimensões e enviar orçamentos direto para o ERP.', icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200/70 text-slate-900 font-sans antialiased flex flex-col justify-between">
      {/* 1. Header logo */}
      <header className="max-w-7xl w-full mx-auto px-6 h-16 flex items-center justify-between border-b border-slate-200/80 shrink-0">
        <BrandLogo className="[&>img]:h-8 [&>img]:w-8" />
        
        <span className="text-[10px] text-slate-600 font-semibold bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
          ERP SaaS Demo v1.0
        </span>
      </header>

      {/* 2. Hero Section */}
      <main className="max-w-7xl w-full mx-auto px-6 py-6 lg:py-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center flex-1 min-h-0">
        {/* Left text column */}
        <div className="lg:col-span-6 space-y-4 lg:space-y-6 text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold w-max">
            <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
            Precificação Inteligente & Gestão Gráfica
          </div>
          
          <h1 className="text-3xl md:text-4xl lg:text-[40px] xl:text-5xl font-black text-slate-900 tracking-tight leading-tight">
            O ERP definitivo para <br />
            <span className="pf-brand-gradient">
              Comunicação Visual & Gráfica
            </span>
          </h1>

          <p className="text-xs md:text-sm lg:text-base text-slate-600 leading-relaxed max-w-lg">
            Tenha controle total de custos de insumos, tempo operacional de máquinas, equipe de acabamento, contas a pagar e orçamentos comerciais integrados em um fluxo de produção Kanban moderno.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              href="/dashboard"
              className="pf-button-primary px-6 py-3"
            >
              Acessar Painel ERP Admin <ArrowRight className="h-4.5 w-4.5" />
            </Link>
            
            <Link
              href="/store"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-extrabold text-slate-900 shadow-sm transition hover:border-primary/30 hover:text-primary"
            >
              Ver Catálogo Online (Cliente) <ShoppingBag className="h-4.5 w-4.5 text-emerald-500" />
            </Link>
          </div>
        </div>

        {/* Right portal visual grids */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 max-h-full lg:overflow-visible pr-1">
          {features.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div 
                key={idx}
                className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-200/40 flex flex-col justify-between hover:border-primary/40 hover:shadow-md transition-all group duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 transition-colors group-hover:bg-primary group-hover:text-white duration-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-xs md:text-sm group-hover:text-primary transition-colors duration-300">{feat.title}</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{feat.description}</p>
              </div>
            );
          })}
        </div>
      </main>

      {/* 3. Footer info */}
      <footer className="border-t border-slate-200/80 py-4 text-center text-xs text-slate-500 shrink-0 bg-white/40 backdrop-blur-sm">
        <p>© 2026 PrintFlowPRO ERP SaaS. Desenvolvido para Alta Lucratividade de Gráficas e Comunicação Visual.</p>
      </footer>
    </div>
  );
}
