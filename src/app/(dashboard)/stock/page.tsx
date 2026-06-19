'use client';

import React, { useState } from 'react';
import { 
  Package, 
  Search, 
  AlertTriangle, 
  PlusCircle, 
  Check, 
  X,
  History
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { formatCurrencyInput, parseCurrencyInputToNumber, stripRichTextHtml } from '@/lib/utils';

export default function StockPage() {
  const { products, stockMovements, adjustStock } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>('inventory');
  
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Form State for adjustments
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjustType, setAdjustType] = useState<'entrada' | 'saida'>('entrada');
  const [quantity, setQuantity] = useState(0);
  const [cost, setCost] = useState(0);
  const [reason, setReason] = useState('Compra');

  // Filter products
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || quantity <= 0) return;

    adjustStock(selectedProductId, quantity, reason, adjustType, cost > 0 ? cost : undefined);

    // Reset Form
    setSelectedProductId('');
    setQuantity(0);
    setCost(0);
    setReason('Compra');
    setIsAdjusting(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className={`space-y-6 ${isAdjusting ? 'hidden' : ''}`}>
        {/* Visual Tab Controls and Adjust button */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
        {/* Toggle list vs movement logs */}
        <div className="flex items-center gap-1.5 bg-secondary/30 p-1 rounded-xl border border-border w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 sm:flex-none text-center px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'inventory' 
                ? 'bg-card text-foreground shadow-sm border border-border' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5 justify-center"><Package className="h-4 w-4" /> Inventário</span>
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`flex-1 sm:flex-none text-center px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'movements' 
                ? 'bg-card text-foreground shadow-sm border border-border' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-1.5 justify-center"><History className="h-4 w-4" /> Histórico de Movimentações</span>
          </button>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar SKU ou produto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-card border border-border rounded-xl text-xs focus:outline-none text-foreground"
            />
          </div>
          <button
            onClick={() => setIsAdjusting(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all shrink-0"
          >
            <PlusCircle className="h-4 w-4" /> Ajustar Estoque
          </button>
        </div>
      </div>
      </div>

      {/* Adjust Stock Form Inline */}
      {isAdjusting && (
        <div className="max-w-xl mx-auto bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print w-full animate-in slide-in-from-bottom duration-300">
          <form onSubmit={handleAdjustStock} className="flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                <PlusCircle className="h-4.5 w-4.5 text-primary" /> Ajustar Inventário / Lançar Estoque
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAdjusting(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Select */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Produto / Insumo *</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="">Selecione o produto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Estoque atual: {p.current_stock} {p.pricing_type === 'm2' ? 'm²' : 'un'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjust Type */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Tipo de Movimento</label>
                <select
                  value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as typeof adjustType)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs font-semibold text-foreground focus:outline-none"
                >
                  <option value="entrada">Entrada (+)</option>
                  <option value="saida">Saída (-)</option>
                </select>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Quantidade</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
              </div>

              {/* Cost */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Custo Unitário (R$)</label>
                <input
                  type="text"
                  value={formatCurrencyInput(cost)}
                  onChange={(e) => setCost(parseCurrencyInputToNumber(e.target.value))}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Motivo do Ajuste</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="Compra">Compra / Aquisição Insumos</option>
                  <option value="Uso Produção">Consumo em Produção</option>
                  <option value="Ajuste Inventário">Correção de Inventário / Perda</option>
                  <option value="Retorno">Retorno de Cliente / Troca</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
              <button
                type="button"
                onClick={() => setIsAdjusting(false)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1"
              >
                <Check className="h-4 w-4" /> Registrar Ajuste
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={isAdjusting ? 'hidden' : ''}>
        {/* 4. Active Tab content */}
      {activeTab === 'inventory' ? (
        /* Inventory Table */
        <div className="bg-card border border-border rounded-2xl shadow-sm">
          <div className="px-5 py-4 border-b border-border bg-secondary/10 flex justify-between items-center">
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Ficha de Estoque & Insumos</h3>
            <span className="text-[11px] text-muted-foreground font-semibold">Exibindo {filteredProducts.length} itens cadastrados</span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="min-w-[980px] w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                  <th className="px-5 py-3">Código SKU</th>
                  <th className="px-5 py-3">Produto / Matéria-Prima</th>
                  <th className="px-5 py-3">Cálculo</th>
                  <th className="px-5 py-3 text-right">Custo Base</th>
                  <th className="px-5 py-3 text-right">Valor Venda</th>
                  <th className="px-5 py-3 text-center">Mínimo</th>
                  <th className="px-5 py-3 text-center">Qtd. Atual</th>
                  <th className="px-5 py-3 text-center whitespace-nowrap min-w-[140px]">Status Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((p) => {
                  const belowMin = p.stock_controlled && p.current_stock < p.min_stock;

                  return (
                    <tr key={p.id} className="hover:bg-secondary/15 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-foreground">{p.sku}</td>
                      <td className="px-5 py-3.5">
                        <div>
                          <div className="font-semibold text-foreground">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground max-w-sm truncate">{stripRichTextHtml(p.description)}</div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground font-medium uppercase">{p.pricing_type}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-muted-foreground">{formatCurrency(p.base_cost)}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-foreground">{formatCurrency(p.sales_price)}</td>
                      <td className="px-5 py-3.5 text-center text-muted-foreground font-semibold">
                        {p.stock_controlled ? p.min_stock : '-'}
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-foreground">
                        {p.current_stock}
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        {!p.stock_controlled ? (
                          <span className="inline-flex w-max items-center justify-center whitespace-nowrap text-[10px] text-zinc-400 font-semibold bg-zinc-500/5 px-2 py-0.5 rounded border border-zinc-500/10">
                            Sem Controle
                          </span>
                        ) : belowMin ? (
                          <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 flex items-center gap-1 w-max mx-auto animate-pulse">
                            <AlertTriangle className="h-3 w-3" /> Abaixo Mín.
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1 w-max mx-auto">
                            Regular
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Movement logs */
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-secondary/10">
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Fita de Entrada e Saída de Insumos</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Movimento</th>
                  <th className="px-5 py-3">Produto / Item</th>
                  <th className="px-5 py-3 text-center">Quantidade</th>
                  <th className="px-5 py-3 text-right">Custo Registrado</th>
                  <th className="px-5 py-3">Motivo / Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stockMovements.length > 0 ? (
                  stockMovements.map((move) => {
                    const isInput = move.type === 'entrada';

                    return (
                      <tr key={move.id} className="hover:bg-secondary/15 transition-colors">
                        <td className="px-5 py-3.5 text-muted-foreground font-semibold">
                          {new Date(move.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-5 py-3.5 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            isInput 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {isInput ? 'ENTRADA' : 'SAÍDA'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-foreground">{move.product_name}</td>
                        <td className={`px-5 py-3.5 text-center font-bold ${isInput ? 'text-emerald-500' : 'text-foreground'}`}>
                          {isInput ? '+' : '-'}{move.quantity}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-muted-foreground">
                          {formatCurrency(move.unit_cost)}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-medium">{move.reason}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground italic">
                      Nenhuma movimentação de estoque registrada. Realize um ajuste para ver os registros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
