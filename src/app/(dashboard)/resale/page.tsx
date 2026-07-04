'use client';

import React, { useState } from 'react';
import { 
   
  Search,
  Sparkles
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { formatUnitCurrency } from '@/lib/pricing';
import { formatOrderDisplayNumber, getOrderNumberSearchText } from '@/lib/order-number';

export default function ResalePage() {
  const { orders } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Gather all items in orders that are marked as outsourced
  const getOutsourcedItems = () => {
    const list: {
      orderId: string;
      orderNumber: string;
      customerName: string;
      status: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      supplierName: string;
      outsourcedCost: number;
    }[] = [];

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.outsourced) {
          list.push({
            orderId: order.id,
            orderNumber: order.number,
            customerName: order.customer_name,
            status: order.status,
            itemName: item.product_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            totalPrice: item.total_price,
            supplierName: item.supplier_name || 'Terceirizado Padrão',
            outsourcedCost: item.outsourced_cost || 0
          });
        }
      });
    });

    return list.filter(item => 
      item.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getOrderNumberSearchText(item.orderNumber).includes(searchQuery.toLowerCase()) ||
      item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const outsourcedItems = getOutsourcedItems();

  // Financial sums
  const totalOutsourceRevenue = outsourcedItems.reduce((sum, i) => sum + i.totalPrice, 0);
  const totalOutsourceCost = outsourcedItems.reduce((sum, i) => sum + (i.outsourcedCost * i.quantity), 0);
  const totalNetResaleProfit = totalOutsourceRevenue - totalOutsourceCost;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* 1. Resale specific stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total revenue */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Faturamento de Revenda</span>
          <h3 className="text-2xl font-black text-foreground mt-2 tracking-tight">
            {formatCurrency(totalOutsourceRevenue)}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">Total cobrado dos clientes finais</p>
        </div>

        {/* Cost outsourced */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Custo de Terceirização</span>
          <h3 className="text-2xl font-black text-amber-500 mt-2 tracking-tight">
            {formatCurrency(totalOutsourceCost)}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">Pago aos fornecedores gráficos parceiros</p>
        </div>

        {/* Net Profit */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm border-dashed">
          <span className="text-[10px] font-bold text-emerald-400 uppercase">Lucro Líquido de Revenda</span>
          <h3 className="text-2xl font-black text-emerald-500 mt-2 tracking-tight">
            {formatCurrency(totalNetResaleProfit)}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">
            Margem real líquida: {totalOutsourceRevenue > 0 ? `${Math.round((totalNetResaleProfit / totalOutsourceRevenue) * 100)}%` : '0%'}
          </p>
        </div>
      </div>

      {/* 2. Search and tips */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar por pedido, item ou cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-card border border-border rounded-xl text-xs focus:outline-none text-foreground"
          />
        </div>
        <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1 bg-secondary/35 p-2 rounded-xl border border-border">
          <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
          <span>Fluxo de Revenda: Cliente → Revendedor (Você) → Fornecedor → Cliente Final</span>
        </div>
      </div>

      {/* 3. Resale table ledger */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-secondary/15">
          <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Monitoramento de Pedidos Terceirizados</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                <th className="px-5 py-3.5">Pedido</th>
                <th className="px-5 py-3.5">Cliente Final</th>
                <th className="px-5 py-3.5">Item Terceirizado</th>
                <th className="px-5 py-3.5">Fornecedor Gráfico</th>
                <th className="px-5 py-3.5 text-right">Custo Un (Fornecedor)</th>
                <th className="px-5 py-3.5 text-right">Preço Venda (Cliente)</th>
                <th className="px-5 py-3.5 text-right">Lucro Líquido</th>
                <th className="px-5 py-3.5 text-center">Status Pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {outsourcedItems.length > 0 ? (
                outsourcedItems.map((item, idx) => {
                  const itemCost = item.outsourcedCost * item.quantity;
                  const itemProfit = item.totalPrice - itemCost;
                  const markup = itemCost > 0 ? Math.round(((item.totalPrice - itemCost) / itemCost) * 100) : 0;

                  return (
                    <tr key={idx} className="hover:bg-secondary/15 transition-colors">
                      {/* Order number */}
                      <td className="px-5 py-3.5 font-bold text-foreground">{formatOrderDisplayNumber(item.orderNumber)}</td>
                      
                      {/* Customer final */}
                      <td className="px-5 py-3.5 font-semibold text-muted-foreground">{item.customerName}</td>

                      {/* Item description */}
                      <td className="px-5 py-3.5 font-semibold text-foreground">
                        {item.itemName}
                        <span className="ml-1.5 text-[10px] text-muted-foreground font-semibold">({item.quantity} un)</span>
                      </td>

                      {/* Supplier */}
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/15 text-amber-500 text-[10px] font-bold">
                          {item.supplierName}
                        </span>
                      </td>

                      {/* Wholesale Cost */}
                      <td className="px-5 py-3.5 text-right text-muted-foreground font-medium">
                        {formatCurrency(item.outsourcedCost)}
                        <div className="text-[9px] text-muted-foreground">Total: {formatCurrency(itemCost)}</div>
                      </td>

                      {/* Retail Price */}
                      <td className="px-5 py-3.5 text-right text-foreground font-bold">
                        {formatUnitCurrency(item.unitPrice)}
                        <div className="text-[9px] text-muted-foreground">Total: {formatCurrency(item.totalPrice)}</div>
                      </td>

                      {/* Profit Margin */}
                      <td className="px-5 py-3.5 text-right font-extrabold text-emerald-500">
                        {formatCurrency(itemProfit)}
                        <div className="text-[9px] text-emerald-500">+{markup}% margem</div>
                      </td>

                      {/* Order status */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          item.status === 'finalizado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          item.status === 'cancelado' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                          'bg-primary/10 text-primary border-primary/20'
                        }`}>
                          {item.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground italic">
                    Nenhum pedido de revenda terceirizada registrado no momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
