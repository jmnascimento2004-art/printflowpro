'use client';

import React, { useState } from 'react';
import { 
  Truck, 
  Search, 
  Check, 
  ArrowRight, 
  MapPin, 
  User,
  X
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Shipment } from '@/lib/dummy-data';

export default function ShipmentPage() {
  const { shipments, updateShipmentStatus } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [carrierInput, setCarrierInput] = useState('Correios');
  const [trackingInput, setTrackingInput] = useState('');

  // Filter shipments
  const filteredShipments = shipments.filter(s => 
    s.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.order_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleShipPackage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShipment) return;

    updateShipmentStatus(selectedShipment.id, 'enviado', trackingInput, carrierInput);

    // Refresh local selected state
    setSelectedShipment(null);
    setTrackingInput('');
  };

  const getStatusBadge = (status: Shipment['status']) => {
    const styles = {
      separacao: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
      embalagem: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      enviado: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      entregue: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    };

    const labels = {
      separacao: 'Separação',
      embalagem: 'Embalagem',
      enviado: 'Em Trânsito',
      entregue: 'Entregue',
    };

    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className={`space-y-6 ${selectedShipment ? 'hidden' : ''}`}>
        {/* Search and general indicators */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar por pedido ou cliente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-card border border-border rounded-xl text-xs focus:outline-none text-foreground"
          />
        </div>
        <div className="text-xs text-muted-foreground font-semibold">
          Total de Entregas Monitoradas: {shipments.length}
        </div>
      </div>

      {/* Grid of Shipments */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredShipments.length > 0 ? (
          filteredShipments.map((ship) => (
            <div 
              key={ship.id} 
              className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4 hover:border-primary transition-all flex flex-col justify-between"
            >
              {/* Card top */}
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-xs text-foreground block">{ship.order_number}</span>
                    <span className="text-[10px] text-muted-foreground">Logística de Entrega</span>
                  </div>
                  {getStatusBadge(ship.status)}
                </div>

                <div className="space-y-2 text-xs text-muted-foreground border-t border-border/50 pt-3">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <User className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{ship.customer_name}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="leading-tight">
                      {ship.address.street}, {ship.address.number} - {ship.address.neighborhood}, {ship.address.city}/{ship.address.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Canal: {ship.carrier} {ship.tracking_code ? `(${ship.tracking_code})` : ''}</span>
                  </div>
                </div>
              </div>

              {/* Action transitions bottom */}
              <div className="border-t border-border/50 pt-4 flex gap-2 w-full mt-4 justify-end items-center">
                {ship.status === 'separacao' && (
                  <button
                    onClick={() => updateShipmentStatus(ship.id, 'embalagem')}
                    className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow"
                  >
                    Pronto para Embalagem <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {ship.status === 'embalagem' && (
                  <button
                    onClick={() => {
                      setSelectedShipment(ship);
                      setCarrierInput(ship.carrier || 'Correios');
                    }}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow"
                  >
                    Despachar Envio <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {ship.status === 'enviado' && (
                  <button
                    onClick={() => updateShipmentStatus(ship.id, 'entregue')}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow"
                  >
                    Confirmar Entrega <Check className="h-3.5 w-3.5" />
                  </button>
                )}

                {ship.status === 'entregue' && (
                  <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1 italic">
                    <Check className="h-4 w-4 text-emerald-500" /> Entrega Concluída
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 bg-card border border-border rounded-2xl flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Truck className="h-10 w-10 text-muted-foreground/35 mb-2" />
            <span className="text-xs font-semibold">Nenhuma entrega em andamento na expedição.</span>
          </div>
        )}
      </div>
      </div>

      {/* Dispatch Shipment Input Code Inline */}
      {selectedShipment && (
        <div className="max-w-md mx-auto bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print w-full animate-in slide-in-from-bottom duration-300">
          <form onSubmit={handleShipPackage} className="flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                <Truck className="h-4.5 w-4.5 text-primary" /> Informar Dados de Despacho
              </h3>
              <button 
                type="button" 
                onClick={() => setSelectedShipment(null)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Transportadora / Canal de Envio</label>
                <input
                  type="text"
                  required
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  placeholder="Ex: Correios, Jadlog, Entregador Balcão"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Código de Rastreamento / Identificação</label>
                <input
                  type="text"
                  required
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="Ex: PM123456789BR ou Retirada"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-4">
              <button
                type="button"
                onClick={() => setSelectedShipment(null)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1"
              >
                <Check className="h-4 w-4" /> Confirmar Despacho
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
