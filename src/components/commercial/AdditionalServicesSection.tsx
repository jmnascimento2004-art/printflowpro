'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AdditionalService } from '@/lib/dummy-data';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';

const INITIAL_DEFAULT_SERVICES = [
  'Arte Final',
  'Vetorização',
  'Criação de Logomarca',
  'Revisão de Arquivo',
  'Digitalização'
];

const safeNumber = (value: number) => Number.isFinite(value) ? value : 0;

export const getAdditionalServicesTotal = (services?: AdditionalService[]) =>
  (services || []).reduce((sum, service) => sum + safeNumber(service.total_price), 0);

interface AdditionalServicesSectionProps {
  services: AdditionalService[];
  onChange: (services: AdditionalService[]) => void;
  storageKey?: string;
}

export function AdditionalServicesSection({ services, onChange, storageKey = 'printflow_default_additional_services' }: AdditionalServicesSectionProps) {
  const [customName, setCustomName] = useState('');

  const getDefaultServices = () => {
    if (typeof window === 'undefined') return INITIAL_DEFAULT_SERVICES;
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]') as string[];
      return Array.from(new Set([...INITIAL_DEFAULT_SERVICES, ...stored.filter(Boolean)]));
    } catch {
      return INITIAL_DEFAULT_SERVICES;
    }
  };

  const defaultServices = getDefaultServices();

  const persistDefaultService = (name: string) => {
    if (typeof window === 'undefined' || !name.trim()) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || '[]') as string[];
      const next = Array.from(new Set([...stored, name.trim()]));
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Default service persistence is optional and should never block the sale flow.
    }
  };

  const addService = (name: string, isCustom = false) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    const service: AdditionalService = {
      id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      notes: '',
      is_custom: isCustom,
      save_as_default: false
    };
    onChange([...services, service]);
    setCustomName('');
  };

  const updateService = (id: string, patch: Partial<AdditionalService>) => {
    onChange(services.map((service) => {
      if (service.id !== id) return service;
      const next = { ...service, ...patch };
      const quantity = safeNumber(Number(next.quantity));
      const unitPrice = safeNumber(Number(next.unit_price));
      const totalPrice = Math.max(0, quantity * unitPrice);
      if (patch.save_as_default && next.name) {
        persistDefaultService(next.name);
      }
      return {
        ...next,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice
      };
    }));
  };

  const removeService = (id: string) => {
    onChange(services.filter((service) => service.id !== id));
  };

  return (
    <div className="pf-card space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-foreground">Serviços Adicionais</h3>
          <p className="text-xs text-muted-foreground">Cobranças separadas de produtos, estoque e expedição.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="pf-input text-xs"
            defaultValue=""
            onChange={(event) => {
              addService(event.target.value, false);
              event.target.value = '';
            }}
          >
            <option value="" disabled>+ Adicionar Serviço</option>
            {defaultServices.map((service) => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={customName}
              onChange={(event) => setCustomName(event.target.value)}
              placeholder="+ Serviço personalizado"
              className="pf-input min-w-0 text-xs"
            />
            <button
              type="button"
              onClick={() => addService(customName, true)}
              className="pf-button-primary px-3 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
        </div>
      </div>

      {services.length > 0 ? (
        <div className="space-y-3">
          {services.map((service) => (
            <div key={service.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-secondary/20 p-3 lg:grid-cols-[minmax(180px,1fr)_100px_140px_140px_1.3fr_44px] lg:items-end">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Nome</span>
                <input
                  value={service.name}
                  onChange={(event) => updateService(service.id, { name: event.target.value, is_custom: true })}
                  className="pf-input text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Qtd</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={service.quantity}
                  onChange={(event) => updateService(service.id, { quantity: Number(event.target.value) })}
                  className="pf-input text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Valor unitário</span>
                <input
                  value={formatCurrencyInput(service.unit_price)}
                  onChange={(event) => updateService(service.id, { unit_price: parseCurrencyInputToNumber(event.target.value) })}
                  className="pf-input text-xs"
                />
              </label>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Total</span>
                <div className="flex h-11 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-primary">
                  {formatCurrencyInput(service.total_price)}
                </div>
              </div>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Observação</span>
                <input
                  value={service.notes || ''}
                  onChange={(event) => updateService(service.id, { notes: event.target.value })}
                  className="pf-input text-xs"
                />
                {service.is_custom && (
                  <label className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={Boolean(service.save_as_default)}
                      onChange={(event) => updateService(service.id, { save_as_default: event.target.checked })}
                    />
                    Salvar como serviço padrão
                  </label>
                )}
              </label>
              <button
                type="button"
                onClick={() => removeService(service.id)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                title="Remover serviço"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-center text-xs font-semibold text-muted-foreground">
          Nenhum serviço adicional informado.
        </div>
      )}
    </div>
  );
}
