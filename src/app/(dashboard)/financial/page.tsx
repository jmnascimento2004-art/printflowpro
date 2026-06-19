'use client';

import React, { useState } from 'react';
import { 
   
  PlusCircle, 
  Search, 
  Check,
  X,
  Plus
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { FinancialTransaction } from '@/lib/dummy-data';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';

export default function FinancialPage() {
  const { financial, addTransaction, updateTransactionStatus } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'receita' | 'despesa'>('todos');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pago' | 'pendente'>('todos');
  
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);

  // Form State
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'receita' | 'despesa'>('receita');
  const [category, setCategory] = useState('Venda');
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<FinancialTransaction['payment_method']>('pix');
  const [status, setStatus] = useState<'pendente' | 'pago'>('pago');
  const [dueDate, setDueDate] = useState('');
  const [installments, setInstallments] = useState(1); // Support installments (parcelamento)

  // 1. Calculations
  const totalReceived = financial
    .filter(f => f.type === 'receita' && f.status === 'pago')
    .reduce((sum, f) => sum + f.amount, 0);

  const totalPaid = financial
    .filter(f => f.type === 'despesa' && f.status === 'pago')
    .reduce((sum, f) => sum + f.amount, 0);

  const netCashFlow = totalReceived - totalPaid;

  const accountsReceivable = financial
    .filter(f => f.type === 'receita' && f.status === 'pendente')
    .reduce((sum, f) => sum + f.amount, 0);

  const accountsPayable = financial
    .filter(f => f.type === 'despesa' && f.status === 'pendente')
    .reduce((sum, f) => sum + f.amount, 0);

  // 2. Filter list
  const filteredTransactions = financial.filter(f => {
    const matchesSearch = f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (f.order_number && f.order_number.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === 'todos' ? true : f.type === typeFilter;
    const matchesStatus = statusFilter === 'todos' ? true : f.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleCreateTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || amount <= 0) return;

    const installmentVal = amount / installments;
    const baseDueDate = dueDate ? new Date(dueDate) : new Date();

    for (let i = 0; i < installments; i++) {
      const currentDueDate = new Date(baseDueDate);
      currentDueDate.setMonth(currentDueDate.getMonth() + i);

      addTransaction({
        type,
        category,
        amount: installmentVal,
        description: installments > 1 ? `${description} (${i + 1}/${installments})` : description,
        payment_method: paymentMethod,
        status: status,
        due_date: currentDueDate.toISOString().split('T')[0],
        paid_at: status === 'pago' ? new Date().toISOString() : undefined
      });
    }

    // Reset Form
    setDescription('');
    setAmount(0);
    setInstallments(1);
    setDueDate('');
    setIsAddingTransaction(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className={`space-y-6 ${isAddingTransaction ? 'hidden' : ''}`}>
        {/* 1. Metric Indicators Banner Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Cash */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Saldo de Caixa Atual</span>
          <h3 className={`text-2xl font-black mt-2 tracking-tight ${netCashFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {formatCurrency(netCashFlow)}
          </h3>
          <div className="flex gap-2 text-[10px] text-muted-foreground mt-1 font-semibold">
            <span>R: {formatCurrency(totalReceived)}</span>
            <span>•</span>
            <span>D: {formatCurrency(totalPaid)}</span>
          </div>
        </div>

        {/* Accounts Receivable */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Contas a Receber (Pendente)</span>
          <h3 className="text-2xl font-black text-foreground mt-2 tracking-tight">
            {formatCurrency(accountsReceivable)}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">Valores previstos de vendas</p>
        </div>

        {/* Accounts Payable */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Contas a Pagar (Pendente)</span>
          <h3 className="text-2xl font-black text-amber-500 mt-2 tracking-tight">
            {formatCurrency(accountsPayable)}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">Despesas e faturas a vencer</p>
        </div>

        {/* Net Monthly Profit Margin estimate */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Eficiência de Caixa</span>
          <h3 className="text-2xl font-black text-primary mt-2 tracking-tight">
            {totalReceived > 0 ? `${Math.round((netCashFlow / totalReceived) * 100)}%` : '0%'}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-1">Margem operacional real do período</p>
        </div>
      </div>

      {/* 2. List Control Filters and Create Button */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Pesquisar descrição, categoria ou pedido..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-card border border-border rounded-xl text-xs focus:outline-none text-foreground"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="px-2 py-1.5 bg-card border border-border rounded-xl text-xs text-foreground font-semibold"
            >
              <option value="todos">Receitas e Despesas</option>
              <option value="receita">Apenas Receitas</option>
              <option value="despesa">Apenas Despesas</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-2 py-1.5 bg-card border border-border rounded-xl text-xs text-foreground font-semibold"
            >
              <option value="todos">Todos os Status</option>
              <option value="pago">Apenas Pagos</option>
              <option value="pendente">Apenas Pendentes</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => setIsAddingTransaction(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all shrink-0 w-full sm:w-auto justify-center"
        >
          <Plus className="h-4 w-4" /> Registrar Lançamento
        </button>
      </div>

      </div>

      {/* 3. Transaction Form Inline */}
      {isAddingTransaction && (
        <div className="max-w-xl mx-auto bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print w-full animate-in slide-in-from-bottom duration-300">
          <form onSubmit={handleCreateTransaction} className="flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                <PlusCircle className="h-4.5 w-4.5 text-primary" /> Registrar Lançamento de Caixa
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAddingTransaction(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Type Switcher */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Tipo de Lançamento</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs font-semibold text-foreground focus:outline-none"
                >
                  <option value="receita">Receita (Entrada)</option>
                  <option value="despesa">Despesa (Saída)</option>
                </select>
              </div>

              {/* Category */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  {type === 'receita' ? (
                    <>
                      <option value="Venda">Vendas Gráficas</option>
                      <option value="Serviços">Ajuste de Serviços</option>
                      <option value="Aporte">Aporte Capital</option>
                      <option value="Outros">Outros Rendimentos</option>
                    </>
                  ) : (
                    <>
                      <option value="Insumos">Compra Insumos / Lona / Mídia</option>
                      <option value="Aluguel">Aluguel / Condomínio</option>
                      <option value="Salários">Salários de Funcionários</option>
                      <option value="Impostos">Impostos Fiscais / MEI</option>
                      <option value="Softwares">SaaS / Ferramentas de Design</option>
                      <option value="Energia">Energia Elétrica / Telefonia</option>
                      <option value="Manutenção">Manutenção de Plotters</option>
                    </>
                  )}
                </select>
              </div>

              {/* Description */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Descrição do Lançamento *</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Compra de rolo de lona de banner com fornecedor"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                />
              </div>

              {/* Value Amount */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Valor Total (R$) *</label>
                <input
                  type="text"
                  required
                  value={formatCurrencyInput(amount)}
                  onChange={(e) => setAmount(parseCurrencyInputToNumber(e.target.value))}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none"
                />
              </div>

              {/* Installments (Parcelamento) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Parcelar em (Nº vezes)</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={installments}
                  onChange={(e) => setInstallments(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold text-center"
                />
              </div>

              {/* Method */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Forma de Pagamento</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="pix">Pix</option>
                  <option value="cartao_credito">Cartão de Crédito</option>
                  <option value="cartao_debito">Cartão de Débito</option>
                  <option value="boleto">Boleto Bancário</option>
                  <option value="dinheiro">Dinheiro Físico</option>
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Situação Inicial</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs font-semibold text-foreground focus:outline-none"
                >
                  <option value="pago">Confirmado (Pago / Recebido)</option>
                  <option value="pendente">Pendente (Agendar vencimento)</option>
                </select>
              </div>

              {/* Due Date */}
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Vencimento (ou data da transação)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
              <button
                type="button"
                onClick={() => setIsAddingTransaction(false)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1"
              >
                <Check className="h-4 w-4" /> Confirmar Lançamento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Ledger Table View */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-secondary/10 flex justify-between items-center">
          <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Extrato Financeiro de Caixa</h3>
          <span className="text-[11px] text-muted-foreground font-semibold">Exibindo {filteredTransactions.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                <th className="px-5 py-3">Data Venc.</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Descrição / Lançamento</th>
                <th className="px-5 py-3">Meio</th>
                <th className="px-5 py-3 text-right">Valor</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((trans) => {
                  const isIncome = trans.type === 'receita';

                  return (
                    <tr key={trans.id} className="hover:bg-secondary/20 transition-colors">
                      {/* Due date */}
                      <td className="px-5 py-3.5 text-muted-foreground font-semibold">
                        {new Date(trans.due_date).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Type Indicator */}
                      <td className="px-5 py-3.5 font-bold">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                          isIncome 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {isIncome ? 'ENTRADA' : 'SAÍDA'}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="px-5 py-3.5 text-muted-foreground font-semibold">{trans.category}</td>

                      {/* Description */}
                      <td className="px-5 py-3.5 text-foreground font-medium">
                        {trans.description}
                        {trans.order_number && (
                          <span className="ml-1 text-[9px] bg-secondary text-foreground px-1.5 py-0.5 rounded font-bold">
                            {trans.order_number}
                          </span>
                        )}
                      </td>

                      {/* Method */}
                      <td className="px-5 py-3.5 text-muted-foreground font-medium uppercase">{trans.payment_method}</td>

                      {/* Value Amount */}
                      <td className={`px-5 py-3.5 text-right font-bold text-xs ${isIncome ? 'text-emerald-500' : 'text-foreground'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(trans.amount)}
                      </td>

                      {/* Status Check trigger */}
                      <td className="px-5 py-3.5 text-center">
                        {trans.status === 'pago' ? (
                          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Confirmado
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              if (confirm('Marcar este lançamento pendente como pago e consolidar saldo de caixa?')) {
                                updateTransactionStatus(trans.id, 'pago');
                              }
                            }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1 mx-auto transition-all"
                          >
                            <Check className="h-3 w-3" /> Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground italic">
                    Nenhuma transação financeira lançada.
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
