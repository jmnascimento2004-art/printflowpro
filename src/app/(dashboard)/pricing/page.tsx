'use client';

import React, { useState, useEffect } from 'react';
import { 
  Calculator, 
  Percent, 
  Clock, 
  Save,
  Coins,
  Cpu,
  Plus,
  Trash2
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';

type OutsourcedChargeType = 'fixed' | 'm2' | 'hour' | 'day';

type OutsourcedService = {
  id: string;
  active: boolean;
  name: string;
  chargeType: OutsourcedChargeType;
  quantity: number;
  unitValue: number;
};

const VISUAL_SERVICE_TYPES = [
  'Adesivo vinil simples',
  'Adesivo com recorte',
  'Adesivo com mascara de aplicacao',
  'Adesivo com instalacao',
  'Placa PVC',
  'Placa ACM',
  'Placa de sinalizacao',
  'Fachada',
  'Estrutura metalica',
  'Servico com serralheria',
  'Servico com marcenaria',
  'Instalacao avulsa',
  'Outro servico personalizado'
];

const OUTSOURCED_CHARGE_LABELS: Record<OutsourcedChargeType, string> = {
  fixed: 'Valor fixo',
  m2: 'Por m2',
  hour: 'Por hora',
  day: 'Diaria'
};

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

  // Advanced visual communication calculator - local simulation only.
  const [visualServiceType, setVisualServiceType] = useState(VISUAL_SERVICE_TYPES[0]);
  const [visualDescription, setVisualDescription] = useState('');
  const [visualWidth, setVisualWidth] = useState(1);
  const [visualHeight, setVisualHeight] = useState(1);
  const [visualQuantity, setVisualQuantity] = useState(1);
  const [visualWastePercent, setVisualWastePercent] = useState(12);
  const [mainMaterialCostM2, setMainMaterialCostM2] = useState(35);
  const [vinylCostM2, setVinylCostM2] = useState(0);
  const [maskCostM2, setMaskCostM2] = useState(0);
  const [structureMaterialCostM2, setStructureMaterialCostM2] = useState(0);
  const [otherInputsCost, setOtherInputsCost] = useState(0);
  const [outsourcedServices, setOutsourcedServices] = useState<OutsourcedService[]>([
    {
      id: 'outsourced-1',
      active: false,
      name: 'Recorte terceirizado',
      chargeType: 'm2',
      quantity: 1,
      unitValue: 0
    }
  ]);
  const [artMinutes, setArtMinutes] = useState(20);
  const [finishingMinutes, setFinishingMinutes] = useState(30);
  const [maskMinutes, setMaskMinutes] = useState(0);
  const [internalHourlyCost, setInternalHourlyCost] = useState(45);
  const [installationEnabled, setInstallationEnabled] = useState(false);
  const [installerCount, setInstallerCount] = useState(1);
  const [installationHours, setInstallationHours] = useState(2);
  const [installerHourlyCost, setInstallerHourlyCost] = useState(55);
  const [travelCost, setTravelCost] = useState(0);
  const [otherInstallationCost, setOtherInstallationCost] = useState(0);
  const [difficultyPercent, setDifficultyPercent] = useState(0);
  const [advancedTaxPercent, setAdvancedTaxPercent] = useState(settings.tax_rate ?? 6);
  const [advancedMarginPercent, setAdvancedMarginPercent] = useState(35);

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

  const visualM2 = visualWidth * visualHeight * visualQuantity;
  const visualM2WithWaste = visualM2 * (1 + visualWastePercent / 100);
  const advancedMaterialCost =
    visualM2WithWaste * mainMaterialCostM2 +
    visualM2WithWaste * vinylCostM2 +
    visualM2WithWaste * maskCostM2 +
    visualM2WithWaste * structureMaterialCostM2 +
    otherInputsCost;
  const outsourcedTotal = outsourcedServices.reduce((sum, service) => {
    if (!service.active) return sum;
    return sum + service.quantity * service.unitValue;
  }, 0);
  const internalLaborCost = ((artMinutes + finishingMinutes + maskMinutes) / 60) * internalHourlyCost;
  const installationBaseCost = installationEnabled
    ? installerCount * installationHours * installerHourlyCost + travelCost + otherInstallationCost
    : 0;
  const installationCost = installationBaseCost * (1 + difficultyPercent / 100);
  const advancedTotalCost = advancedMaterialCost + outsourcedTotal + internalLaborCost + installationCost;
  const advancedTaxDenominator = Math.max(0.05, 1 - advancedTaxPercent / 100);
  const advancedMarginDenominator = Math.max(0.05, 1 - advancedMarginPercent / 100);
  const advancedMinimumPrice = advancedTotalCost / advancedTaxDenominator;
  const advancedRecommendedPrice = advancedMinimumPrice / advancedMarginDenominator;
  const advancedEstimatedProfit = advancedRecommendedPrice - advancedTotalCost;

  const updateOutsourcedService = (id: string, updates: Partial<OutsourcedService>) => {
    setOutsourcedServices((current) =>
      current.map((service) => service.id === id ? { ...service, ...updates } : service)
    );
  };

  const addOutsourcedService = () => {
    setOutsourcedServices((current) => [
      ...current,
      {
        id: `outsourced-${Date.now()}`,
        active: true,
        name: 'Outro servico terceirizado',
        chargeType: 'fixed',
        quantity: 1,
        unitValue: 0
      }
    ]);
  };

  const removeOutsourcedService = (id: string) => {
    setOutsourcedServices((current) => current.filter((service) => service.id !== id));
  };

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
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground mt-2">{formatCurrency(suggestedPrice)}</h2>
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

      <section className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-primary">Precificacao Avancada</p>
              <h2 className="mt-1 text-xl font-bold text-foreground">Comunicacao Visual e Terceirizados</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                Este calculo considera materiais, perdas, terceirizacao, mao de obra, instalacao, deslocamento e margem. Ajuste os custos conforme a realidade da sua empresa.
              </p>
            </div>
            <span className="w-fit rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
              Simulacao local
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                <Calculator className="h-4 w-4 text-primary" /> 1. Dados do servico
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo de servico</label>
                  <select
                    value={visualServiceType}
                    onChange={(e) => setVisualServiceType(e.target.value)}
                    className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground outline-none"
                  >
                    {VISUAL_SERVICE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Descricao do servico</label>
                  <input
                    type="text"
                    value={visualDescription}
                    onChange={(e) => setVisualDescription(e.target.value)}
                    placeholder="Ex: Placa ACM com estrutura e instalacao"
                    className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Largura (m)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={visualWidth}
                    onChange={(e) => setVisualWidth(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-foreground outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Altura (m)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={visualHeight}
                    onChange={(e) => setVisualHeight(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-foreground outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={visualQuantity}
                    onChange={(e) => setVisualQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-foreground outline-none"
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <label className="text-muted-foreground">Percentual de perda</label>
                    <span className="text-primary">{visualWastePercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={visualWastePercent}
                    onChange={(e) => setVisualWastePercent(parseInt(e.target.value) || 0)}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                <Cpu className="h-4 w-4 text-primary" /> 2. Materiais e insumos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CurrencyField label="Material principal por m2" value={mainMaterialCostM2} onChange={setMainMaterialCostM2} />
                <CurrencyField label="Adesivo/vinil por m2" value={vinylCostM2} onChange={setVinylCostM2} />
                <CurrencyField label="Mascara de aplicacao por m2" value={maskCostM2} onChange={setMaskCostM2} />
                <CurrencyField label="Lona/PVC/ACM/madeira/ferragem por m2" value={structureMaterialCostM2} onChange={setStructureMaterialCostM2} />
                <CurrencyField label="Outros insumos" value={otherInputsCost} onChange={setOtherInputsCost} />
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <MetricCard label="m2 total" value={`${visualM2.toFixed(2)} m2`} />
                <MetricCard label="m2 com perda" value={`${visualM2WithWaste.toFixed(2)} m2`} />
                <MetricCard label="Custo de materiais" value={formatCurrency(advancedMaterialCost)} />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                  <Coins className="h-4 w-4 text-primary" /> 3. Servicos terceirizados
                </h3>
                <button
                  type="button"
                  onClick={addOutsourcedService}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/15"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar custo
                </button>
              </div>

              <div className="space-y-3">
                {outsourcedServices.map((service) => (
                  <div key={service.id} className="rounded-xl border border-border bg-secondary/20 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-[auto_1.4fr_1fr_0.8fr_1fr_auto] gap-3 md:items-end">
                      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={service.active}
                          onChange={(e) => updateOutsourcedService(service.id, { active: e.target.checked })}
                          className="h-4 w-4 rounded border-border text-primary"
                        />
                        Ativo
                      </label>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Servico</label>
                        <input
                          type="text"
                          value={service.name}
                          onChange={(e) => updateOutsourcedService(service.id, { name: e.target.value })}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Cobranca</label>
                        <select
                          value={service.chargeType}
                          onChange={(e) => updateOutsourcedService(service.id, { chargeType: e.target.value as OutsourcedChargeType })}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground outline-none"
                        >
                          {Object.entries(OUTSOURCED_CHARGE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Base</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={service.quantity}
                          onChange={(e) => updateOutsourcedService(service.id, { quantity: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none"
                        />
                      </div>
                      <CurrencyField label="Valor unit." value={service.unitValue} onChange={(value) => updateOutsourcedService(service.id, { unitValue: value })} compact />
                      <button
                        type="button"
                        onClick={() => removeOutsourcedService(service.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                        aria-label="Remover servico terceirizado"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 text-right text-xs font-bold text-foreground">
                      Subtotal: {formatCurrency(service.active ? service.quantity * service.unitValue : 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                  <Clock className="h-4 w-4 text-primary" /> 4. Mao de obra interna
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberField label="Arte/preparacao (min)" value={artMinutes} onChange={setArtMinutes} />
                  <NumberField label="Acabamento (min)" value={finishingMinutes} onChange={setFinishingMinutes} />
                  <NumberField label="Mascara (min)" value={maskMinutes} onChange={setMaskMinutes} />
                  <CurrencyField label="Custo interno/hora" value={internalHourlyCost} onChange={setInternalHourlyCost} />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                    <Percent className="h-4 w-4 text-primary" /> 5. Instalacao
                  </h3>
                  <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={installationEnabled}
                      onChange={(e) => setInstallationEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary"
                    />
                    Ativar
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberField label="Aplicadores" value={installerCount} onChange={setInstallerCount} min={1} />
                  <NumberField label="Horas estimadas" value={installationHours} onChange={setInstallationHours} />
                  <CurrencyField label="Custo/hora aplicador" value={installerHourlyCost} onChange={setInstallerHourlyCost} />
                  <CurrencyField label="Deslocamento" value={travelCost} onChange={setTravelCost} />
                  <CurrencyField label="Outros custos" value={otherInstallationCost} onChange={setOtherInstallationCost} />
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Dificuldade</label>
                    <select
                      value={difficultyPercent}
                      onChange={(e) => setDifficultyPercent(parseInt(e.target.value) || 0)}
                      className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground outline-none"
                    >
                      <option value={0}>Normal (0%)</option>
                      <option value={10}>Medio (+10%)</option>
                      <option value={20}>Alto (+20%)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                <Percent className="h-4 w-4 text-primary" /> 6. Margem, taxas e preco
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">Taxas/impostos</span>
                    <span className="text-rose-500">{advancedTaxPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    value={advancedTaxPercent}
                    onChange={(e) => setAdvancedTaxPercent(parseInt(e.target.value) || 0)}
                    className="w-full accent-rose-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">Margem desejada</span>
                    <span className="text-primary">{advancedMarginPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={advancedMarginPercent}
                    onChange={(e) => setAdvancedMarginPercent(parseInt(e.target.value) || 0)}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          <aside className="xl:col-span-4">
            <div className="sticky top-24 space-y-4 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">Resumo do calculo</p>
                <h3 className="mt-1 text-base font-bold text-foreground">{visualServiceType}</h3>
                {visualDescription && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{visualDescription}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="m2 total" value={`${visualM2.toFixed(2)} m2`} />
                <MetricCard label="m2 com perda" value={`${visualM2WithWaste.toFixed(2)} m2`} />
              </div>

              <div className="space-y-2 border-t border-border pt-4 text-xs">
                <SummaryLine label="Materiais" value={formatCurrency(advancedMaterialCost)} />
                <SummaryLine label="Terceirizados" value={formatCurrency(outsourcedTotal)} />
                <SummaryLine label="Mao de obra interna" value={formatCurrency(internalLaborCost)} />
                <SummaryLine label="Instalacao" value={formatCurrency(installationCost)} />
                <SummaryLine label="Custo total" value={formatCurrency(advancedTotalCost)} strong />
                <SummaryLine label="Preco minimo" value={formatCurrency(advancedMinimumPrice)} />
              </div>

              <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4 text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">Preco recomendado</span>
                <div className="mt-1 text-2xl font-extrabold text-foreground">
                  {formatCurrency(advancedRecommendedPrice)}
                </div>
                <div className="mt-1 text-xs font-semibold text-emerald-500">
                  Lucro estimado: {formatCurrency(advancedEstimatedProfit)}
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-3 text-xs leading-5 text-muted-foreground">
                Esta primeira versao nao salva no banco de dados. Use o resultado como guia comercial e ajuste custos reais antes de enviar proposta ao cliente.
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function CurrencyField({
  label,
  value,
  onChange,
  compact = false
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-muted-foreground`}>{label}</label>
      <input
        type="text"
        value={formatCurrencyInput(value)}
        onChange={(e) => onChange(parseCurrencyInputToNumber(e.target.value))}
        className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-foreground outline-none"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        type="number"
        min={min}
        step="0.01"
        value={value}
        onChange={(e) => onChange(Math.max(min, parseFloat(e.target.value) || min))}
        className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold text-foreground outline-none"
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong = false
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'border-t border-border pt-2 font-black text-foreground' : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span className={strong ? 'text-foreground' : 'font-bold text-foreground'}>{value}</span>
    </div>
  );
}
