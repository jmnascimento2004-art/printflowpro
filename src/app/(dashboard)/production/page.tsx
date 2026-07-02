'use client';

import React, { useRef, useState } from 'react';
import { 
   
  Clock, 
  User, 
  AlertTriangle,
  Search,
  Sparkles,
  Truck
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { ProductionItem } from '@/lib/dummy-data';
import { isCancelledOrder, normalizeStatus } from '@/lib/order-status';
import { openWhatsAppUrl, validateWhatsAppPhone } from '@/lib/whatsapp';
import { getWhatsAppTimeGreeting } from '@/lib/utils';

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
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragScrollRef = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const [isBoardDragging, setIsBoardDragging] = useState(false);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const paymentStatusLabels: Record<string, string> = {
    pendente: 'Pendente',
    parcial: 'Parcial',
    pago: 'Pago',
    reembolsado: 'Reembolsado'
  };

  const getOrderForProductionItem = (item: ProductionItem) =>
    orders.find(o => o.id === item.order_id || o.number === item.order_number);

  const sendWhatsAppStatus = (item: ProductionItem) => {
    const order = getOrderForProductionItem(item);
    const customer = order ? customers.find(c => c.id === order.customer_id) : null;
    
    if (!customer || !customer.phone) {
      alert("Cliente ou telefone não encontrado para este pedido!");
      return;
    }
    
    const isValidWhatsAppPhone = validateWhatsAppPhone(customer.phone);
    if (!isValidWhatsAppPhone) {
      alert("Telefone inválido para este cliente!");
      return;
    }

      
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
    const greeting = getWhatsAppTimeGreeting();

    const message = `${greeting}, *${customer.name}*!\n\nPassando para informar que o seu pedido *${item.order_number}* (*${item.product_name}*) avançou na nossa linha de produção e agora está na fase de: *${statusName}*.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\n*${companyName}*`;
    
    const opened = openWhatsAppUrl(customer.phone, message);
    if (!opened) {
      alert("Cliente sem telefone vÃ¡lido para WhatsApp.");
    }
  };

  // Dynamic list of tech profiles to assign
  const technicians = (profiles || [])
    .filter(p => p.active && ['admin', 'gerente', 'producao', 'arte_finalista', 'estoque'].includes(p.role))
    .map(p => p.name);

  // Itens historicos permanecem salvos, mas pedido cancelado nao e fila ativa.
  const activeProductionQueue = production.filter(p => !isCancelledOrder(getOrderForProductionItem(p)));

  const mapProductionStatusToColumn = (status: unknown): ProductionItem['status'] => {
    const normalized = normalizeStatus(status);
    if (normalized.includes('acabamento') || normalized === 'finishing') return 'impressao';
    return normalized as ProductionItem['status'];
  };

  // 1. Filter production queue based on search
  const filteredQueue = activeProductionQueue.filter(p =>
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.order_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Kanban columns configuration
  const columns: Array<{ id: string; label: string; statuses: ProductionItem['status'][]; targetStatus: ProductionItem['status']; color: string; borderTop: string }> = [
    { id: 'aguardando', label: 'Aguardando', statuses: ['fila'], targetStatus: 'fila', color: 'border-zinc-500/50 bg-zinc-500/5', borderTop: 'border-t-zinc-400' },
    { id: 'preparacao', label: 'Preparacao', statuses: ['producao'], targetStatus: 'producao', color: 'border-purple-500/50 bg-purple-500/5', borderTop: 'border-t-purple-500' },
    { id: 'producao', label: 'Producao', statuses: ['impressao'], targetStatus: 'impressao', color: 'border-blue-500/50 bg-blue-500/5', borderTop: 'border-t-blue-500' },
    { id: 'pronto', label: 'Pronto', statuses: ['concluido'], targetStatus: 'concluido', color: 'border-emerald-500/50 bg-emerald-500/5', borderTop: 'border-t-emerald-500' },
    { id: 'rota-entrega', label: 'Em rota de entrega', statuses: ['expedicao'], targetStatus: 'expedicao', color: 'border-cyan-500/50 bg-cyan-500/5', borderTop: 'border-t-cyan-500' },
    { id: 'entregue-finalizado', label: 'Entregue / Finalizado', statuses: ['entregue', 'finalizado'], targetStatus: 'entregue', color: 'border-teal-500/50 bg-teal-500/5', borderTop: 'border-t-teal-500' },
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

  const finishBoardDrag = () => {
    dragScrollRef.current.active = false;
    setIsBoardDragging(false);
  };

  const handleBoardMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('[draggable="true"], button, input, select, textarea, a')) return;

    dragScrollRef.current = {
      active: true,
      startX: event.pageX - (boardRef.current?.offsetLeft || 0),
      scrollLeft: boardRef.current?.scrollLeft || 0
    };
    setIsBoardDragging(true);
  };

  const handleBoardMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragScrollRef.current.active || !boardRef.current) return;
    event.preventDefault();

    const x = event.pageX - boardRef.current.offsetLeft;
    const walk = (x - dragScrollRef.current.startX) * 1.2;
    boardRef.current.scrollLeft = dragScrollRef.current.scrollLeft - walk;
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
          <span>Arraste cartões para atualizar fases ou arraste o fundo para navegar.</span>
        </div>
      </div>

      {/* 2. Production Kanban Board Grid */}
      <div
        ref={boardRef}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={finishBoardDrag}
        onMouseLeave={finishBoardDrag}
        className={`overflow-x-auto pb-4 flex gap-3 h-[630px] items-start select-none no-print ${isBoardDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        {columns.map((column) => {
          const colItems = filteredQueue.filter(item => column.statuses.includes(mapProductionStatusToColumn(item.status)));

          return (
            <div
              key={column.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.targetStatus)}
              className="w-64 min-w-[256px] bg-card border border-border rounded-xl h-full flex flex-col shadow-sm"
            >
              {/* Header Column */}
              <div className={`p-3 border-b border-border flex justify-between items-center rounded-t-xl border-t-4 ${column.borderTop} ${column.color}`}>
                <h4 className="font-bold text-[11px] uppercase text-foreground truncate max-w-[180px] flex items-center gap-1.5">
                  {column.id === 'rota-entrega' && <Truck className="h-3.5 w-3.5 text-cyan-500" />}
                  {column.label}
                </h4>
                <span className="text-[10px] font-extrabold bg-secondary text-foreground px-2 py-0.5 rounded-full shrink-0">
                  {colItems.length}
                </span>
              </div>

              {/* Cards Wrapper */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {colItems.length > 0 ? (
                  colItems.map((item) => {
                    const overdue = isOverdue(item.deadline, item.status);
                    const order = getOrderForProductionItem(item);
                    const paymentStatus = order?.payment_status ? paymentStatusLabels[order.payment_status] || order.payment_status : 'Não informado';

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        className={`p-3 bg-secondary/40 border rounded-lg hover:border-primary transition-all duration-150 shadow-sm relative group space-y-2.5 cursor-grab active:cursor-grabbing ${
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
                          {order && (
                            <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                              <p className="truncate">
                                Cliente: <span className="font-bold text-foreground">{order.customer_name}</span>
                              </p>
                              <div className="flex items-center justify-between gap-2">
                                <span>
                                  Financeiro: <span className="font-bold text-foreground">{paymentStatus}</span>
                                </span>
                                <span className="font-black text-primary">{formatCurrency(order.total_amount)}</span>
                              </div>
                            </div>
                          )}
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
