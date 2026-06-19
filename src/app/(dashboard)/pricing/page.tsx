'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Percent, 
  Clock, 
  Save,
  Coins,
  Cpu
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';

export default function PricingPage() {
  const { addProduct, categories, settings } = useDatabase();

  // Pricing Parameters
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pricingType, setPricingType] = useState<'unidade' | 'm2' | 'linear' | 'pacote'>('m2');
  const [sku, setSku] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  
  // Cost & Operational states
  const [rawMaterialCost, setRawMaterialCost] = useState(15.00);
  const [wastePercent, setWastePercent] = useState(10);
  const [operatingCostMin, setOperatingCostMin] = useState(0.30); // e.g. R$0.30/min
  const [productionTime, setProductionTime] = useState(15); // minutes
  
  // Margins & Shares
  const [marginType, setMarginType] = useState<'percent' | 'markup'>('percent');
  const [profitMargin, setProfitMargin] = useState(40); // 40% margin
  const [markupMultiplier, setMarkupMultiplier] = useState(2.2); // 2.2x multiplier
  const [pricingDefaultsTouched, setPricingDefaultsTouched] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(settings.commission_rate ?? 5);
  const [taxPercent, setTaxPercent] = useState(settings.tax_rate ?? 6);

  // Simulation variables
  const [simWidth, setSimWidth] = useState(1.0);
  const [simHeight, setSimHeight] = useState(1.0);
  const [simQuantity, setSimQuantity] = useState(1);

  // Computed Outputs
  const [operationalCost, setOperationalCost] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [suggestedPrice, setSuggestedPrice] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [commissionAmount, setCommissionAmount] = useState(0);

  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    if (pricingDefaultsTouched) return;

    setCommissionPercent(settings.commission_rate ?? 5);
    setTaxPercent(settings.tax_rate ?? 6);
  }, [settings.commission_rate, settings.tax_rate, pricingDefaultsTouched]);

  const handleCommissionPercentChange = (value: number) => {
    setPricingDefaultsTouched(true);
    setCommissionPercent(value);
  };

  const handleTaxPercentChange = (value: number) => {
    setPricingDefaultsTouched(true);
    setTaxPercent(value);
  };

  // Auto calculate when inputs change
  useEffect(() => {
    // 1. Direct Cost with waste
    const direct = rawMaterialCost * (1 + wastePercent / 100);

    // 2. Operational Cost
    const operational = operatingCostMin * productionTime;
    setOperationalCost(operational);

    // 3. Total base production cost
    const baseCost = direct + operational;
    setTotalCost(baseCost);

    // 4. Suggested Retail Price
    let price = 0;
    if (marginType === 'percent') {
      // Required Price = Cost / (1 - (Profit% + Tax% + Commission%) / 100)
      const denominator = 1 - (profitMargin + taxPercent + commissionPercent) / 100;
      if (denominator > 0.05) {
        price = baseCost / denominator;
      } else {
        // Fallback to prevent divide by zero
        price = baseCost * 3.5;
      }
    } else {
      // Cost * Multiplier, then add taxes/commissions as markup adjustments
      const basePrice = baseCost * markupMultiplier;
      const denominator = 1 - (taxPercent + commissionPercent) / 100;
      price = basePrice / denominator;
    }

    setSuggestedPrice(price);

    // 5. Deductions
    const taxes = price * (taxPercent / 100);
    const commission = price * (commissionPercent / 100);
    const profit = price - baseCost - taxes - commission;

    setTaxAmount(taxes);
    setCommissionAmount(commission);
    setNetProfit(profit);
  }, [
    rawMaterialCost,
    wastePercent,
    operatingCostMin,
    productionTime,
    marginType,
    profitMargin,
    markupMultiplier,
    commissionPercent,
    taxPercent
  ]);

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor, informe o nome do produto.');
      return;
    }

    addProduct({
      name,
      description: `Produto precificado automaticamente por ${pricingType}. Custo base: R$ ${totalCost.toFixed(2)}`,
      sku: sku || `AUTO-${pricingType.toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
      category_id: categoryId || (categories[0] ? categories[0].id : ''),
      pricing_type: pricingType,
      base_cost: totalCost,
      sales_price: suggestedPrice,
      stock_controlled: true,
      min_stock: 10,
      active: true,
      delivery_time: deliveryTime.trim() || undefined,
      pricing_details: {
        raw_material_cost: rawMaterialCost,
        operating_cost: operationalCost,
        production_time: productionTime,
        markup: marginType === 'percent' ? profitMargin : markupMultiplier * 100,
        commission: commissionPercent,
        taxes: taxPercent,
        waste_percent: wastePercent,
        calculated_price: suggestedPrice,
        delivery_time: deliveryTime.trim() || undefined
      }
    });

    setNotification('Produto salvo e adicionado ao estoque do ERP com sucesso!');
    setName('');
    setSku('');
    setDeliveryTime('');
    
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const getPricingTypeLabel = () => {
    const labels: Record<string, string> = {
      unidade: 'Unidade',
      m2: 'Metro Quadrado (m²)',
      linear: 'Metro Linear',
      pacote: 'Pacote / Centena'
    };
    return labels[pricingType] || pricingType;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Get simulated job price
  const getSimulatedJob = () => {
    let size = 1.0;
    if (pricingType === 'm2') {
      size = simWidth * simHeight;
    } else if (pricingType === 'linear') {
      size = simWidth;
    }
    
    const cost = totalCost * size * simQuantity;
    const price = suggestedPrice * size * simQuantity;
    const profit = price - cost - (price * (taxPercent + commissionPercent) / 100);

    return { size, cost, price, profit };
  };

  const simulation = getSimulatedJob();

  return (
    <div className="space-y-6">
      {/* Visual notification */}
      {notification && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs font-semibold animate-in fade-in duration-300">
          {notification}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Panel */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm lg:col-span-7 space-y-5">
          <div className="border-b border-border pb-3">
            <h3 className="font-bold text-foreground text-sm uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="h-4.5 w-4.5 text-primary" /> Parâmetros de Precificação
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Determine custos diretos, indiretos e margens operacionais</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pricing Mode */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Unidade de Medida</label>
              <select
                value={pricingType}
                onChange={(e) => setPricingType(e.target.value as typeof pricingType)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-medium"
              >
                <option value="unidade">Por Unidade</option>
                <option value="m2">Por Metro Quadrado (m²)</option>
                <option value="linear">Por Metro Linear</option>
                <option value="pacote">Por Pacote / Kit</option>
              </select>
            </div>

            {/* Category Select */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Categoria do Catálogo</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-medium"
              >
                <option value="">Selecione...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* SKU */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Código de Estoque (SKU)</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: BAN-440-L"
                className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>
          </div>

          {/* Section: Costs */}
          <div className="border-t border-border pt-4 space-y-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-primary" /> Matéria-Prima & Produção
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Material cost input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">Custo da Matéria-Prima ({pricingType === 'm2' ? 'm²' : 'un'})</span>
                  <span className="text-foreground">{formatCurrency(rawMaterialCost)}</span>
                </div>
                <input
                  type="text"
                  value={formatCurrencyInput(rawMaterialCost)}
                  onChange={(e) => setRawMaterialCost(parseCurrencyInputToNumber(e.target.value))}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                />
              </div>

              {/* Waste slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">Margem de Desperdício / Retalhos</span>
                  <span className="text-primary">{wastePercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={wastePercent}
                  onChange={(e) => setWastePercent(parseInt(e.target.value) || 0)}
                  className="w-full accent-primary bg-secondary h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Operating Cost Minute rate */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">Custo Operacional da Máquina / Hora</span>
                  <span className="text-foreground">{formatCurrency(operatingCostMin * 60)} ({formatCurrency(operatingCostMin)}/min)</span>
                </div>
                <input
                  type="text"
                  value={formatCurrencyInput(operatingCostMin * 60)}
                  onChange={(e) => setOperatingCostMin(parseCurrencyInputToNumber(e.target.value) / 60)}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground"
                />
              </div>

              {/* Time in production slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">Tempo de Execução (Minutos)</span>
                  <span className="text-primary flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {productionTime} min</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="120"
                  value={productionTime}
                  onChange={(e) => setProductionTime(parseInt(e.target.value) || 1)}
                  className="w-full accent-primary bg-secondary h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Section: Profit margins and factors */}
          <div className="border-t border-border pt-4 space-y-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5 text-primary" /> Lucratividade, Comissão & Impostos
            </h4>

            <div className="flex items-center gap-2 mb-3 bg-secondary/20 p-1.5 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setMarginType('percent')}
                className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  marginType === 'percent' 
                    ? 'bg-card text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Margem de Lucro Líquido (%)
              </button>
              <button
                type="button"
                onClick={() => setMarginType('markup')}
                className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  marginType === 'markup' 
                    ? 'bg-card text-foreground shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Multiplicador de Custo (Markup)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Profit target selection */}
              {marginType === 'percent' ? (
                <div className="space-y-1.5 md:col-span-1">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-muted-foreground">Meta Margem Líquida</span>
                    <span className="text-primary font-bold">{profitMargin}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={profitMargin}
                    onChange={(e) => setProfitMargin(parseInt(e.target.value) || 10)}
                    className="w-full accent-primary bg-secondary h-1.5 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Fator Markup (Multiplicador)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.1"
                    value={markupMultiplier}
                    onChange={(e) => setMarkupMultiplier(Math.max(1.1, parseFloat(e.target.value) || 1.1))}
                    className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-bold"
                  />
                </div>
              )}

              {/* Commission input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">Comissão de Venda</span>
                  <span className="text-amber-500 font-bold">{commissionPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={commissionPercent}
                  onChange={(e) => handleCommissionPercentChange(parseInt(e.target.value) || 0)}
                  className="w-full accent-amber-500 bg-secondary h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Impostos */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-muted-foreground">Impostos (%)</span>
                  <span className="text-rose-500 font-bold">{taxPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  value={taxPercent}
                  onChange={(e) => handleTaxPercentChange(parseInt(e.target.value) || 0)}
                  className="w-full accent-rose-500 bg-secondary h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Section: Save to catalog */}
          <div className="border-t border-border pt-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nome do Produto para Catálogo ERP *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Banner Lona Fosca 440g Ilhós"
                  className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Prazo de Entrega</label>
                <input
                  type="text"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  placeholder="Ex: Até 2 dias úteis"
                  className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground font-medium"
                />
              </div>
              <button
                onClick={handleSaveProduct}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all"
              >
                <Save className="h-4 w-4" /> Salvar Produto e Registrar no Catálogo
              </button>
            </div>
          </div>
        </div>

        {/* Right Output Panel */}
        <div className="lg:col-span-5 space-y-6">
          {/* Main suggested price gauge */}
          <div className="bg-gradient-to-br from-primary/15 to-indigo-500/10 border border-primary/20 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden group">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Valor de Venda Sugerido</span>
            <h2 className="text-4xl font-extrabold tracking-tight text-foreground mt-2">{formatCurrency(suggestedPrice)}</h2>
            <span className="text-[10px] text-muted-foreground mt-1">Por {getPricingTypeLabel()}</span>

            {/* Micro details bar chart */}
            <div className="w-full grid grid-cols-2 gap-4 mt-6 pt-5 border-t border-border/40">
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Custo Total</span>
                <span className="text-sm font-bold text-foreground">{formatCurrency(totalCost)}</span>
              </div>
              <div className="text-center border-l border-border/40">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Lucro Líquido</span>
                <span className="text-sm font-bold text-emerald-500">{formatCurrency(netProfit)} ({Math.round((netProfit / suggestedPrice) * 100 || 0)}%)</span>
              </div>
            </div>
          </div>

          {/* Breakdown progress list */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">Composição do Preço de Venda</h4>
            
            <div className="space-y-3">
              {/* Cost bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Custo de Produção (Material + Operacional)</span>
                  <span className="font-bold text-foreground">{formatCurrency(totalCost)} ({Math.round((totalCost / suggestedPrice) * 100 || 0)}%)</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (totalCost / suggestedPrice) * 100 || 0)}%` }} />
                </div>
              </div>

              {/* Taxes bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Impostos Fiscais</span>
                  <span className="font-bold text-rose-400">{formatCurrency(taxAmount)} ({taxPercent}%)</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: `${taxPercent}%` }} />
                </div>
              </div>

              {/* Commission bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Comissão do Vendedor</span>
                  <span className="font-bold text-amber-500">{formatCurrency(commissionAmount)} ({commissionPercent}%)</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${commissionPercent}%` }} />
                </div>
              </div>

              {/* Net profit bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">Lucro Líquido Real</span>
                  <span className="font-bold text-emerald-500">{formatCurrency(netProfit)} ({Math.round((netProfit / suggestedPrice) * 100 || 0)}%)</span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.max(0, Math.round((netProfit / suggestedPrice) * 100 || 0))}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Dimension Sales Simulator */}
          {['m2', 'linear'].includes(pricingType) && (
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1">
                <Coins className="h-4.5 w-4.5 text-primary" /> Simulador de Orçamento Rápido
              </h4>

              <div className="grid grid-cols-2 gap-3">
                {pricingType === 'm2' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Largura (cm)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={Number((simWidth * 100).toFixed(2))}
                        onChange={(e) => setSimWidth(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                        className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold text-center"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground">Altura (cm)</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={Number((simHeight * 100).toFixed(2))}
                        onChange={(e) => setSimHeight(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                        className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold text-center"
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground">Comprimento (cm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={Number((simWidth * 100).toFixed(2))}
                      onChange={(e) => setSimWidth(Math.max(1, parseFloat(e.target.value) || 1) / 100)}
                      className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold text-center"
                    />
                  </div>
                )}
                
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={simQuantity}
                    onChange={(e) => setSimQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold text-center"
                  />
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Área Calculada:</span>
                  <span className="font-bold text-foreground">
                    {pricingType === 'm2' ? `${(simWidth * simHeight).toFixed(2)} m²` : `${simWidth.toFixed(2)} m`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Custo Estimado:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(simulation.cost)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border pt-1.5">
                  <span className="font-bold text-foreground">Preço de Venda Final:</span>
                  <span className="font-extrabold text-primary text-sm">{formatCurrency(simulation.price)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold text-emerald-500">
                  <span>Margem Líquida Estimada:</span>
                  <span>{formatCurrency(simulation.profit)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
