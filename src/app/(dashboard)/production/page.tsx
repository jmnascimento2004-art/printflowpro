'use client';

import React, { useState } from 'react';
import { 
  Wrench, 
  Clock, 
  CheckCircle2, 
  Play, 
  Cpu, 
  User, 
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  SlidersHorizontal,
  Search,
  Sparkles
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { ProductionItem } from '@/lib/dummy-data';

export default function ProductionPage() {
  const { 
    production, 
    updateProductionStatus, 
    assignProductionResponsible,
    orders,
    customers,
    company,
    profiles
  } = useDatabase();

  const [searchQuery, setSearchQuery] = useState('');

  const sendWhatsAppStatus = (item: ProductionItem) => {
    const order = orders.find(o => o.number === item.order_number || o.id === item.order_id);
    const customer = order ? customers.find(c => c.id === order.customer_id) : null;
    
    if (!customer || !customer.phone) {
      alert("Cliente ou telefone não encontrado para este pedido!");
      return;
    }
    
    const cleanPhone = customer.phone.replace(/\D/g, '');
    if (!cleanPhone) {
      alert("Telefone inválido para este cliente!");
      return;
    }

    const formattedPhone = cleanPhone.length === 11 || cleanPhone.length === 10
      ? `55${cleanPhone}`
      : cleanPhone;
      
    const statusLabels: Record<ProductionItem['status'], string> = {
      fila: 'Fila (Aguardando)',
      producao: 'Preparação',
      impressao: 'Impressão',
      acabamento: 'Acabamento',
      concluido: 'Concluído (Pronto para Retirada/Entrega)',
      expedicao: 'Expedição',
      entregue: 'Entregue',
      finalizado: 'Finalizado'
    };
    const statusName = statusLabels[item.status] || item.status;
    const companyName = company?.name || "Nossa Gráfica";

    const message = `Olá, *${customer.name}*!\n\nPassando para informar que o seu pedido *${item.order_number}* (*${item.product_name}*) avançou na nossa linha de produção e agora está na fase de: *${statusName}*.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\n*${companyName}*`;
    
    const encodedText = encodeURIComponent(message);
    const url = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
    if (typeof window === 'undefined') return;
    window.open(url, '_blank');
  };

  // Dynamic list of tech profiles to assign
  const technicians = (profiles || [])
    .filter(p => p.active && ['admin', 'gerente', 'producao', 'arte_finalista', 'estoque'].includes(p.role))
    .map(p => p.name);

  // 1. Filter production queue based on search
  const filteredQueue = production.filter(p => 
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.order_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Kanban columns configuration
  const columns: { id: ProductionItem['status']; label: string; color: string; borderTop: string }[] = [
    { id: 'fila', label: 'Aguardando', color: 'border-zinc-500/50 bg-zinc-500/5', borderTop: 'border-t-zinc-400' },
    { id: 'producao', label: 'Preparação', color: 'border-purple-500/50 bg-purple-500/5', borderTop: 'border-t-purple-500' },
    { id: 'impressao', label: 'Impressão', color: 'border-blue-500/50 bg-blue-500/5', borderTop: 'border-t-blue-500' },
    { id: 'acabamento', label: 'Acabamento', color: 'border-indigo-500/50 bg-indigo-500/5', borderTop: 'border-t-indigo-500' },
    { id: 'concluido', label: 'Concluído', color: 'border-emerald-500/50 bg-emerald-500/5', borderTop: 'border-t-emerald-500' },
    { id: 'expedicao', label: 'Expedição', color: 'border-cyan-500/50 bg-cyan-500/5', borderTop: 'border-t-cyan-500' },
    { id: 'entregue', label: 'Entregue', color: 'border-teal-500/50 bg-teal-500/5', borderTop: 'border-t-teal-500' },
    { id: 'finalizado', label: 'Finalizado', color: 'border-emerald-600/60 bg-emerald-600/10', borderTop: 'border-t-emerald-600' },
  ];

  // 2. Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: ProductionItem['status']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) {
      updateProductionStatus(id, targetStatus);
    }
  };

  const getPriorityBadge = (priority: ProductionItem['priority']) => {
    const styles = {
      baixa: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      media: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      alta: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border uppercase tracking-wider ${styles[priority]}`}>
        {priority}
      </span>
    );
  };

  const isOverdue = (dateStr: string, status: string) => {
    return new Date(dateStr) < new Date() && !['concluido', 'expedicao', 'entregue', 'finalizado'].includes(status);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar por pedido ou produto na produção..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          />
        </div>
        <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5 shrink-0 bg-secondary/30 p-2 rounded-xl border border-border">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <span>Arraste os cartões de serviço para atualizar a fase de produção!</span>
        </div>
      </div>

      {/* 2. Production Kanban Board Grid */}
      <div className="overflow-x-auto pb-4 flex gap-4 h-[630px] items-start select-none no-print">
        {columns.map((column) => {
          const colItems = filteredQueue.filter(item => item.status === column.id);

          return (
            <div
              key={column.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
              className="w-72 min-w-[288px] bg-card border border-border rounded-2xl h-full flex flex-col shadow-sm"
            >
              {/* Header Column */}
              <div className={`p-4 border-b border-border flex justify-between items-center rounded-t-2xl border-t-4 ${column.borderTop} ${column.color}`}>
                <h4 className="font-bold text-xs uppercase text-foreground truncate max-w-[200px]">{column.label}</h4>
                <span className="text-[10px] font-extrabold bg-secondary text-foreground px-2 py-0.5 rounded-full shrink-0">
                  {colItems.length}
                </span>
              </div>

              {/* Cards Wrapper */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {colItems.length > 0 ? (
                  colItems.map((item) => {
                    const overdue = isOverdue(item.deadline, item.status);

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        className={`p-3.5 bg-secondary/40 border rounded-xl hover:border-primary transition-all duration-150 shadow-sm relative group space-y-3 cursor-grab active:cursor-grabbing ${
                          overdue ? 'border-rose-500/40 bg-rose-500/5' : 'border-border'
                        }`}
                      >
                        {/* Card Header: Order Number and Priority */}
                        <div className="flex justify-between items-center w-full">
                          <span className="font-bold text-xs text-foreground">{item.order_number}</span>
                          <div className="flex items-center gap-1">
                            {getPriorityBadge(item.priority)}
                            {overdue && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 text-[8px] font-bold uppercase flex items-center gap-0.5 shrink-0">
                                <AlertTriangle className="h-2.5 w-2.5" /> ATRASADO
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Product and details */}
                        <div>
                          <span className="font-semibold text-xs text-foreground block leading-tight">{item.product_name}</span>
                          <span className="text-[10px] text-muted-foreground mt-1 block">
                            Qtd: <span className="font-bold text-foreground">{item.quantity}</span>
                          </span>
                        </div>

                        {/* Technical assignment dropdown */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-0.5">
                            <User className="h-3 w-3" /> Responsável
                          </label>
                          <select
                            value={item.responsible_name || ''}
                            onChange={(e) => assignProductionResponsible(item.id, e.target.value)}
                            className="w-full px-2 py-1 bg-card border border-border rounded text-[10px] font-medium text-foreground focus:outline-none"
                          >
                            <option value="">Sem Atribuição</option>
                            {technicians.map(tech => (
                              <option key={tech} value={tech}>{tech}</option>
                            ))}
                          </select>
                        </div>

                         {/* Footer Deadline */}
                         <div className="flex justify-between items-center pt-2.5 border-t border-border/50 text-[9px] text-muted-foreground">
                           <div className="flex items-center gap-1">
                             <Clock className="h-3 w-3 shrink-0" />
                             <span>
                               {new Date(item.deadline).toLocaleDateString('pt-BR', {
                                 day: '2-digit',
                                 month: '2-digit',
                                 hour: '2-digit',
                                 minute: '2-digit'
                               })}
                             </span>
                           </div>
                           
                           <button
                             type="button"
                             onClick={(e) => {
                               e.stopPropagation();
                               sendWhatsAppStatus(item);
                             }}
                             className="flex items-center gap-1.5 px-2 py-1 rounded-none bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold uppercase text-[8px] tracking-wide border border-emerald-500/10 hover:border-emerald-500/25 transition-colors cursor-pointer select-none"
                             title="Notificar progresso de produção via WhatsApp Web"
                           >
                             <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24">
                               <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.863-9.864.001-2.63-1.023-5.101-2.883-6.963C16.588 1.843 14.116.822 11.5.822 6.066.822 1.641 5.242 1.638 10.682c-.001 1.666.436 3.292 1.267 4.724L1.878 20.1l4.769-1.25zM17.51 14.86c-.3-.149-1.772-.875-2.046-.975-.276-.1-.476-.149-.676.15-.2.3-.777.975-.951 1.174-.176.2-.351.224-.651.075-.3-.149-1.268-.467-2.417-1.493-.892-.796-1.495-1.78-1.67-2.079-.176-.3-.019-.462.13-.611.134-.133.3-.35.45-.525.15-.175.2-.299.3-.5.1-.2.05-.375-.025-.525-.075-.15-.676-1.625-.926-2.225-.244-.582-.491-.504-.676-.513-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.276.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.11 3.224 5.112 4.521.714.309 1.272.494 1.707.632.716.227 1.368.195 1.884.118.574-.085 1.772-.724 2.022-1.424.25-.7.25-1.299.175-1.424-.075-.125-.275-.199-.575-.349z" />
                             </svg>
                             <span>Notificar</span>
                           </button>
                         </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-center p-6 border border-dashed border-border/60 rounded-xl text-muted-foreground text-[10px] italic">
                    Nenhum job nesta fase
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
