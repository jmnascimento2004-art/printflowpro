import type { ProductionItem } from '@/lib/dummy-data';

const PRODUCTION_STATUS_LABELS: Record<ProductionItem['status'], string> = {
  fila: 'Fila (Aguardando)',
  producao: 'Preparação',
  impressao: 'Impressão',
  acabamento: 'Acabamento',
  concluido: 'Concluído (Pronto para Retirada/Entrega)',
  expedicao: 'Expedição',
  entregue: 'Entregue',
  finalizado: 'Finalizado'
};

export function formatWhatsAppProductionStatus(status: ProductionItem['status']): string {
  return PRODUCTION_STATUS_LABELS[status] || status;
}
