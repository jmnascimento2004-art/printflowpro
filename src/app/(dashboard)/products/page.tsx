'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Package, 
  Check, 
  X, 
  Filter, 
  FileText, 
  Coins, 
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Product } from '@/lib/dummy-data';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';

export default function ProductsCRUDPage() {
  const { 
    products, 
    categories, 
    addProduct, 
    updateProduct, 
    deleteProduct,
    adjustStock,
    addCategory,
    updateCategory,
    deleteCategory
  } = useDatabase();

  const [viewMode, setViewMode] = useState<'products' | 'categories'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Category management States
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [isCategoryEditing, setIsCategoryEditing] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');

  const getProductCount = (catId: string) => {
    return products.filter(p => p.category_id === catId).length;
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    if (isCategoryEditing) {
      updateCategory(selectedCatId, catName, catDescription);
      setIsCategoryEditing(false);
    } else {
      addCategory(catName, catDescription);
    }

    setCatName('');
    setCatDescription('');
    setSelectedCatId('');
  };

  // Form State
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pricingType, setPricingType] = useState<Product['pricing_type']>('unidade');
  const [baseCost, setBaseCost] = useState(0);
  const [salesPrice, setSalesPrice] = useState(0);
  const [stockControlled, setStockControlled] = useState(true);
  const [minStock, setMinStock] = useState(10);
  const [initialStock, setInitialStock] = useState(0); // For creation only
  const [active, setActive] = useState(true);
  const [isPromo, setIsPromo] = useState(false);
  const [isHighlight, setIsHighlight] = useState(false);

  // Advanced States
  const [imageUrl, setImageUrl] = useState('');
  const [volumePricing, setVolumePricing] = useState<Array<{ min_qty: number, price: number }>>([]);
  const [tempMinQty, setTempMinQty] = useState<number | ''>(2);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [tempTotalPrice, setTempTotalPrice] = useState<number>(0);

  const handleTempPriceChange = (val: number, qty: number | '' = tempMinQty) => {
    setTempPrice(val);
    const numericQty = typeof qty === 'number' ? qty : 0;
    setTempTotalPrice(Math.round(val * numericQty * 100) / 100);
  };

  const handleTempTotalPriceChange = (val: number, qty: number | '' = tempMinQty) => {
    setTempTotalPrice(val);
    const numericQty = typeof qty === 'number' ? qty : 0;
    setTempPrice(numericQty > 0 ? Math.round((val / numericQty) * 10000) / 10000 : 0);
  };

  const handleTempMinQtyChange = (valStr: string) => {
    if (valStr === '') {
      setTempMinQty('');
      setTempTotalPrice(0);
      return;
    }
    const qty = parseInt(valStr) || 0;
    setTempMinQty(qty);
    setTempTotalPrice(Math.round(tempPrice * qty * 100) / 100);
  };

  // Profitability parameters
  const [profitMargin, setProfitMargin] = useState(40);
  const [commissionPercent, setCommissionPercent] = useState(5);
  const [taxPercent, setTaxPercent] = useState(6);

  // Auto calculate suggested sales price based on cost and margins
  useEffect(() => {
    if (baseCost <= 0) {
      setSalesPrice(0);
      return;
    }
    const denominator = 1 - (profitMargin + taxPercent + commissionPercent) / 100;
    const calculated = denominator > 0.05 ? baseCost / denominator : baseCost * 3.5;
    setSalesPrice(Math.round(calculated * 100) / 100);
  }, [baseCost, profitMargin, commissionPercent, taxPercent]);

  // Auto SKU Helper
  const handleAutoSku = () => {
    setSku(`SKU-${pricingType.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  // Image reader
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("A imagem é muito grande! Escolha um arquivo de até 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Volume pricing helpers
  const addVolumeTier = () => {
    const qty = typeof tempMinQty === 'number' ? tempMinQty : 0;
    if (qty <= 1) {
      alert("A quantidade mínima deve ser maior que 1.");
      return;
    }
    if (tempPrice <= 0) {
      alert("O preço deve ser maior que zero.");
      return;
    }
    if (volumePricing.some(tier => tier.min_qty === qty)) {
      alert("Já existe uma faixa configurada para esta quantidade mínima.");
      return;
    }

    const updated = [...volumePricing, { min_qty: qty, price: tempPrice }]
      .sort((a, b) => a.min_qty - b.min_qty);
    setVolumePricing(updated);
    setTempMinQty(2);
    setTempPrice(0);
    setTempTotalPrice(0);
  };

  const removeVolumeTier = (qty: number) => {
    setVolumePricing(prev => prev.filter(t => t.min_qty !== qty));
  };


  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'todos' ? true : p.category_id === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleOpenCreate = () => {
    setName('');
    setSku('');
    setDescription('');
    setCategoryId(categories[0]?.id || '');
    setPricingType('unidade');
    setBaseCost(0);
    setSalesPrice(0);
    setStockControlled(true);
    setMinStock(10);
    setInitialStock(0);
    setActive(true);
    setIsPromo(false);
    setIsHighlight(false);
    setImageUrl('');
    setVolumePricing([]);
    setTempMinQty(2);
    setTempPrice(0);
    setTempTotalPrice(0);
    setProfitMargin(40);
    setCommissionPercent(5);
    setTaxPercent(6);
    setIsEditing(false);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setSelectedProduct(prod);
    setName(prod.name);
    setSku(prod.sku);
    setDescription(prod.description);
    setCategoryId(prod.category_id);
    setPricingType(prod.pricing_type);
    setBaseCost(prod.base_cost);
    setSalesPrice(prod.sales_price);
    setStockControlled(prod.stock_controlled);
    setMinStock(prod.min_stock);
    setActive(prod.active);
    setIsPromo(prod.is_promo || false);
    setIsHighlight(prod.is_highlight || false);
    setImageUrl(prod.image_url || '');
    setVolumePricing(prod.volume_pricing || []);
    setTempMinQty(2);
    setTempPrice(0);
    setTempTotalPrice(0);
    if (prod.pricing_details) {
      setProfitMargin(prod.pricing_details.markup || 40);
      setCommissionPercent(prod.pricing_details.commission || 5);
      setTaxPercent(prod.pricing_details.taxes || 6);
    } else {
      setProfitMargin(40);
      setCommissionPercent(5);
      setTaxPercent(6);
    }
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEditing && selectedProduct) {
      // Edit Product
      updateProduct({
        ...selectedProduct,
        name,
        sku: sku.trim() || `SKU-${pricingType.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        description,
        category_id: categoryId,
        pricing_type: pricingType,
        base_cost: baseCost,
        sales_price: salesPrice,
        stock_controlled: stockControlled,
        min_stock: minStock,
        active,
        is_promo: isPromo,
        is_highlight: isHighlight,
        image_url: imageUrl || undefined,
        volume_pricing: volumePricing.length > 0 ? volumePricing : undefined,
        pricing_details: {
          raw_material_cost: baseCost,
          operating_cost: 0,
          production_time: 0,
          markup: profitMargin,
          commission: commissionPercent,
          taxes: taxPercent,
          waste_percent: 0,
          calculated_price: salesPrice
        }
      });
    } else {
      // Create Product
      const newProd = addProduct({
        name,
        sku: sku.trim() || `SKU-${pricingType.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        description,
        category_id: categoryId,
        pricing_type: pricingType,
        base_cost: baseCost,
        sales_price: salesPrice,
        stock_controlled: stockControlled,
        min_stock: minStock,
        active,
        is_promo: isPromo,
        is_highlight: isHighlight,
        image_url: imageUrl || undefined,
        volume_pricing: volumePricing.length > 0 ? volumePricing : undefined,
        pricing_details: {
          raw_material_cost: baseCost,
          operating_cost: 0,
          production_time: 0,
          markup: profitMargin,
          commission: commissionPercent,
          taxes: taxPercent,
          waste_percent: 0,
          calculated_price: salesPrice
        }
      });

      // Inject initial stock movement if set
      if (stockControlled && initialStock > 0) {
        adjustStock(
          newProd.id, 
          initialStock, 
          'Lançamento Inicial de Estoque', 
          'entrada', 
          baseCost
        );
      }
    }

    setIsFormOpen(false);
    setSelectedProduct(null);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (    <div className="space-y-6 animate-in fade-in duration-300">
      {!isFormOpen ? (
        <>
          {/* Header tabs toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print border-b border-border/50 pb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Catálogo & Cadastro</h2>
              <p className="text-xs text-muted-foreground">Gerencie seus produtos, serviços e categorias do ERP.</p>
            </div>
            <div className="flex bg-secondary/35 p-1.5 rounded-xl border border-border/40 gap-1 self-start sm:self-center">
              <button
                onClick={() => setViewMode('products')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'products'
                    ? 'bg-card text-foreground shadow-sm border border-border/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                Produtos
              </button>
              <button
                onClick={() => setViewMode('categories')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'categories'
                    ? 'bg-card text-foreground shadow-sm border border-border/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Categorias
              </button>
            </div>
          </div>

          {viewMode === 'products' ? (
            <>
              {/* 1. Header Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Produtos Cadastrados</span>
                  <h3 className="text-2xl font-black text-foreground mt-2 tracking-tight">{products.length}</h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Total no catálogo do ERP</p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Produtos Ativos</span>
                  <h3 className="text-2xl font-black text-emerald-500 mt-2 tracking-tight">
                    {products.filter(p => p.active).length}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Disponíveis para vendas/loja</p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] font-bold text-rose-400 uppercase">Abaixo do Mínimo</span>
                  <h3 className="text-2xl font-black text-rose-500 mt-2 tracking-tight">
                    {products.filter(p => p.stock_controlled && p.current_stock < p.min_stock).length}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Alerta de reposição de insumos</p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] font-bold text-primary uppercase">Cálculo por M² / Linear</span>
                  <h3 className="text-2xl font-black text-primary mt-2 tracking-tight">
                    {products.filter(p => ['m2', 'linear'].includes(p.pricing_type)).length}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">Produtos com dimensões variáveis</p>
                </div>
              </div>

              {/* 2. Actions Filters Row */}
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between no-print">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:max-w-xl">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Pesquisar por nome ou código SKU..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 bg-card border border-border rounded-xl text-xs focus:outline-none text-foreground"
                    />
                  </div>

                  {/* Category Filter */}
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-2 py-1.5 bg-card border border-border rounded-xl text-xs text-foreground font-semibold"
                  >
                    <option value="todos">Todas as Categorias</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleOpenCreate}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all shrink-0 w-full sm:w-auto justify-center"
                >
                  <Plus className="h-4 w-4" /> Cadastrar Produto
                </button>
              </div>

              {/* 3. Products List Table */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-secondary/10 flex justify-between items-center">
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Catálogo Geral de Produtos</h3>
                  <span className="text-[11px] text-muted-foreground font-semibold">Exibindo {filteredProducts.length} registros</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                        <th className="px-5 py-3">SKU / Código</th>
                        <th className="px-5 py-3">Produto / Serviço</th>
                        <th className="px-5 py-3">Categoria</th>
                        <th className="px-5 py-3">Cálculo</th>
                        <th className="px-5 py-3 text-right">Custo Base</th>
                        <th className="px-5 py-3 text-right">Preço de Venda</th>
                        <th className="px-5 py-3 text-center">Estoque</th>
                        <th className="px-5 py-3 text-center">Status</th>
                        <th className="px-5 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredProducts.length > 0 ? (
                        filteredProducts.map((prod) => {
                          const belowMin = prod.stock_controlled && prod.current_stock < prod.min_stock;
                          const catName = categories.find(c => c.id === prod.category_id)?.name || 'Outros';

                          return (
                            <tr key={prod.id} className="hover:bg-secondary/15 transition-colors">
                              {/* SKU */}
                              <td className="px-5 py-3.5 font-bold text-foreground">{prod.sku}</td>

                              {/* Name & Description */}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  {prod.image_url ? (
                                    <img 
                                      src={prod.image_url} 
                                      alt={prod.name} 
                                      className="h-9 w-9 rounded-lg object-cover border border-border bg-background"
                                    />
                                  ) : (
                                    <div className="h-9 w-9 rounded-lg bg-secondary/50 flex items-center justify-center border border-border text-muted-foreground">
                                      <Package className="h-4 w-4" />
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                      <span>{prod.name}</span>
                                      {prod.volume_pricing && prod.volume_pricing.length > 0 && (
                                        <span className="px-1.5 py-0.2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[8px] font-bold rounded" title="Preço por volume ativo">
                                          ATACADO
                                        </span>
                                      )}
                                      {prod.is_promo && (
                                        <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-500 border border-amber-500/25 text-[8px] font-bold rounded">
                                          PROMOÇÃO
                                        </span>
                                      )}
                                      {prod.is_highlight && (
                                        <span className="px-1.5 py-0.2 bg-blue-500/15 text-blue-500 border border-blue-500/25 text-[8px] font-bold rounded">
                                          DESTAQUE
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground max-w-xs truncate" title={prod.description}>{prod.description || '-'}</div>
                                  </div>
                                </div>
                              </td>

                              {/* Category Badge */}
                              <td className="px-5 py-3.5">
                                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                                  {catName}
                                </span>
                              </td>

                              {/* Pricing Type */}
                              <td className="px-5 py-3.5 text-muted-foreground font-semibold uppercase">{prod.pricing_type}</td>

                              {/* Cost */}
                              <td className="px-5 py-3.5 text-right text-muted-foreground font-semibold">
                                {formatCurrency(prod.base_cost)}
                              </td>

                              {/* Sale Price */}
                              <td className="px-5 py-3.5 text-right font-black text-foreground">
                                {formatCurrency(prod.sales_price)}
                              </td>

                              {/* Stock Level */}
                              <td className="px-5 py-3.5 text-center">
                                {!prod.stock_controlled ? (
                                  <span className="text-[10px] text-zinc-400 font-semibold bg-zinc-500/5 px-2 py-0.5 rounded border border-zinc-500/10">
                                    Sem Controle
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <span className={`font-bold ${belowMin ? 'text-rose-500' : 'text-foreground'}`}>
                                      {prod.current_stock}
                                    </span>
                                    {belowMin && (
                                      <span className="text-[8px] text-rose-500 font-bold flex items-center gap-0.5 mt-0.5">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Repor
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Active Status */}
                              <td className="px-5 py-3.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  prod.active 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {prod.active ? 'ATIVO' : 'INATIVO'}
                                </span>
                              </td>

                              {/* Actions */}
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleOpenEdit(prod)}
                                    className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                    title="Editar Produto"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      if (confirm(`Excluir o produto "${prod.name}" do catálogo do ERP?`)) {
                                        deleteProduct(prod.id);
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20"
                                    title="Excluir Produto"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-5 py-8 text-center text-muted-foreground italic">
                            Nenhum produto encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* Categories CRUD Inline view */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              {/* Column 1: Category creation/edit form */}
              <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
                <div className="border-b border-border pb-3">
                  <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                    <Layers className="h-4.5 w-4.5 text-primary" />
                    {isCategoryEditing ? 'Editar Categoria' : 'Nova Categoria'}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isCategoryEditing ? 'Altere as informações da categoria selecionada.' : 'Cadastre uma nova categoria para os produtos.'}
                  </p>
                </div>
                <form onSubmit={handleCategorySubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Nome da Categoria *</label>
                    <input
                      type="text"
                      required
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="Ex: Impressão Digital, Canecas, etc."
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Descrição (Opcional)</label>
                    <textarea
                      value={catDescription}
                      onChange={(e) => setCatDescription(e.target.value)}
                      placeholder="Ex: Produtos impressos em lona ou vinil autoadesivo."
                      rows={3}
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    {isCategoryEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCategoryEditing(false);
                          setCatName('');
                          setCatDescription('');
                          setSelectedCatId('');
                        }}
                        className="flex-1 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all text-center"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      className="flex-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-1"
                    >
                      <Check className="h-4 w-4" />
                      {isCategoryEditing ? 'Atualizar' : 'Salvar'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Column 2 & 3: Categories listing table */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col md:col-span-2">
                <div className="px-5 py-4 border-b border-border bg-secondary/10 flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Categorias Cadastradas</h3>
                  <span className="text-[11px] text-muted-foreground font-semibold">Total: {categories.length}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                        <th className="px-5 py-3">Nome</th>
                        <th className="px-5 py-3">Descrição</th>
                        <th className="px-5 py-3 text-center">Produtos Associados</th>
                        <th className="px-5 py-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {categories.length > 0 ? (
                        categories.map((cat) => {
                          const productCount = getProductCount(cat.id);
                          return (
                            <tr key={cat.id} className="hover:bg-secondary/15 transition-colors">
                              <td className="px-5 py-3.5 font-semibold text-foreground">{cat.name}</td>
                              <td className="px-5 py-3.5 text-muted-foreground max-w-xs truncate">{cat.description || '-'}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-foreground">
                                <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground border border-border">
                                  {productCount} {productCount === 1 ? 'produto' : 'produtos'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setIsCategoryEditing(true);
                                      setSelectedCatId(cat.id);
                                      setCatName(cat.name);
                                      setCatDescription(cat.description || '');
                                    }}
                                    className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                    title="Editar Categoria"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      const count = getProductCount(cat.id);
                                      if (count > 0) {
                                        alert(`Não é possível excluir a categoria "${cat.name}" porque ela possui ${count} produto(s) associado(s).`);
                                        return;
                                      }
                                      if (confirm(`Deseja realmente excluir a categoria "${cat.name}"?`)) {
                                        deleteCategory(cat.id);
                                        if (selectedCatId === cat.id) {
                                          setIsCategoryEditing(false);
                                          setCatName('');
                                          setCatDescription('');
                                          setSelectedCatId('');
                                        }
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20"
                                    title="Excluir Categoria"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground italic">
                            Nenhuma categoria cadastrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="max-w-2xl mx-auto bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print w-full animate-in slide-in-from-bottom duration-300">
          <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3 shrink-0">
              <h3 className="font-bold text-foreground text-sm uppercase flex items-center gap-1.5">
                <Package className="h-4.5 w-4.5 text-primary" /> 
                {isEditing ? 'Editar Produto do Catálogo' : 'Cadastrar Novo Produto'}
              </h3>
              <button 
                type="button" 
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-1">
              {/* Product Name */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Nome do Produto / Serviço *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Caneca Branca Resinada 325ml"
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-semibold"
                />
              </div>

              {/* SKU code */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Código de Estoque (SKU)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Deixar em branco para autogerar"
                    className="flex-1 px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs focus:outline-none text-foreground font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleAutoSku}
                    className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-lg text-[10px] border border-border uppercase transition-all"
                  >
                    Gerar
                  </button>
                </div>
              </div>

              {/* Category Select */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Categoria *</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Pricing Type */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Tipo de Cálculo / Medida</label>
                <select
                  value={pricingType}
                  onChange={(e: any) => setPricingType(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="unidade">Unidade Simples</option>
                  <option value="m2">Metro Quadrado (m²)</option>
                  <option value="linear">Metro Linear</option>
                  <option value="pacote">Pacote / Kit</option>
                </select>
              </div>

              {/* Status active */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Status do Produto</label>
                <select
                  value={active ? 'true' : 'false'}
                  onChange={(e) => setActive(e.target.value === 'true')}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="true">Ativo (Exibir no ERP/Loja)</option>
                  <option value="false">Inativo (Bloquear venda)</option>
                </select>
              </div>

              {/* Tags Destaque e Promoção */}
              <div className="md:col-span-2 flex flex-col sm:flex-row gap-4 py-2 border-t border-b border-border/40">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPromo}
                    onChange={(e) => setIsPromo(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-border bg-secondary/50 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Marcar como PROMOÇÃO (tag no catálogo)</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isHighlight}
                    onChange={(e) => setIsHighlight(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-border bg-secondary/50 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Marcar como DESTAQUE (tag no catálogo)</span>
                </label>
              </div>

              {/* Product Image Attachment */}
              <div className="space-y-1 md:col-span-2 border-b border-border/60 pb-3">
                <label className="text-xs font-semibold text-muted-foreground block">Imagem do Produto</label>
                <div className="flex items-center gap-4 mt-1.5">
                  {imageUrl ? (
                    <div className="relative h-16 w-16 rounded-xl border border-border overflow-hidden bg-background shrink-0">
                      <img src={imageUrl} alt="Preview" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="absolute top-0 right-0 p-0.5 bg-rose-600 text-white rounded-bl-lg hover:bg-rose-500 transition-colors"
                        title="Remover Imagem"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground shrink-0 bg-secondary/20">
                      <Package className="h-6 w-6 stroke-[1.5]" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <input
                      type="file"
                      id="product-image-upload"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="product-image-upload"
                      className="px-3 py-1.5 bg-secondary border border-border hover:bg-secondary/80 text-foreground font-bold rounded-lg text-xs cursor-pointer inline-block transition-all"
                    >
                      Escolher Arquivo
                    </label>
                    <span className="text-[9px] text-muted-foreground block">PNG, JPG ou WEBP de até 2MB.</span>
                  </div>
                </div>
              </div>

              {/* Cost Price */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Custo de Matéria-Prima / Aquisição (R$)</label>
                <input
                  type="text"
                  value={formatCurrencyInput(baseCost)}
                  onChange={(e) => setBaseCost(parseCurrencyInputToNumber(e.target.value))}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none font-semibold"
                />
              </div>

              {/* Sales Price */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Preço Final de Venda Sugerido (R$) *</label>
                <input
                  type="text"
                  required
                  value={formatCurrencyInput(salesPrice)}
                  onChange={(e) => setSalesPrice(parseCurrencyInputToNumber(e.target.value))}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none font-bold"
                />
              </div>

              {/* Margens de Precificação */}
              <div className="md:col-span-2 bg-secondary/15 p-4 rounded-xl border border-border space-y-3.5">
                <span className="font-bold text-xs text-foreground block uppercase tracking-wide border-b border-border pb-1">
                  % Lucratividade, Comissão & Impostos
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Meta Margem Líquida */}
                  <div className="space-y-1.5">
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

                  {/* Comissão */}
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
                      onChange={(e) => setCommissionPercent(parseInt(e.target.value) || 0)}
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
                      onChange={(e) => setTaxPercent(parseInt(e.target.value) || 0)}
                      className="w-full accent-rose-500 bg-secondary h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Descrição / Detalhes de Produção</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Caneca para prensagem térmica. Estampa A4 inclusa."
                  rows={2}
                  className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none resize-none"
                />
              </div>

              {/* Volume pricing tiers */}
              <div className="md:col-span-2 border-t border-border/60 pt-3 space-y-3">
                <div>
                  <span className="font-bold text-xs text-foreground block">Preço por Quantidade (Tabela de Volume / Atacado)</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">
                    Defina descontos progressivos para compras em maior volume. Digite o preço unitário ou o preço total do lote para converter automaticamente.
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-secondary/15 p-3 rounded-xl border border-border">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Quantidade</label>
                    <input
                      type="number"
                      value={tempMinQty}
                      onChange={(e) => handleTempMinQtyChange(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground text-center font-bold"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Preço Unitário (R$)</label>
                    <input
                      type="text"
                      value={formatCurrencyInput(tempPrice)}
                      onChange={(e) => handleTempPriceChange(parseCurrencyInputToNumber(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Total do Lote (R$)</label>
                    <input
                      type="text"
                      value={formatCurrencyInput(tempTotalPrice)}
                      onChange={(e) => handleTempTotalPriceChange(parseCurrencyInputToNumber(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-bold"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={addVolumeTier}
                    className="py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg transition-all h-8 flex items-center justify-center w-full"
                  >
                    + Adicionar
                  </button>
                </div>

                {volumePricing.length > 0 && (
                  <div className="border border-border rounded-xl overflow-hidden text-[11px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/30 text-muted-foreground uppercase font-bold text-[9px] border-b border-border">
                          <th className="px-3 py-2 text-center">Quantidade Mínima</th>
                          <th className="px-3 py-2 text-right">Preço Unitário</th>
                          <th className="px-3 py-2 text-right">Preço Total Lote</th>
                          <th className="px-3 py-2 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-medium">
                        {volumePricing.map((tier) => (
                          <tr key={tier.min_qty} className="hover:bg-secondary/10">
                            <td className="px-3 py-2 text-center text-foreground font-bold">A partir de {tier.min_qty} un</td>
                            <td className="px-3 py-2 text-right text-foreground font-bold">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(tier.price)} /un
                            </td>
                            <td className="px-3 py-2 text-right text-foreground font-bold">
                              {formatCurrency(tier.price * tier.min_qty)} total
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeVolumeTier(tier.min_qty)}
                                className="p-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 inline-flex items-center justify-center"
                                title="Excluir Faixa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Stock control configurations */}
              <div className="md:col-span-2 border-t border-border/60 pt-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs text-foreground block">Ativar Controle de Estoque</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">
                    Monitorar quantidade atual e emitir alertas de reposição mínima.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStockControlled(!stockControlled)}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${
                    stockControlled ? 'bg-primary' : 'bg-secondary border border-border'
                  }`}
                >
                  <div className={`h-4.5 w-4.5 bg-white rounded-full transition-transform absolute ${
                    stockControlled ? 'translate-x-5.5' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {stockControlled && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Estoque Mínimo de Alerta</label>
                    <input
                      type="number"
                      value={minStock}
                      onChange={(e) => setMinStock(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none text-center font-semibold"
                    />
                  </div>
                  
                  {!isEditing && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground text-emerald-500">Estoque Inicial (Lançamento)</label>
                      <input
                        type="number"
                        value={initialStock}
                        onChange={(e) => setInitialStock(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-1.5 bg-secondary/50 border border-emerald-500/20 rounded-lg text-xs text-foreground focus:outline-none text-center font-bold"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all flex items-center gap-1"
              >
                <Check className="h-4 w-4" /> 
                {isEditing ? 'Atualizar Produto' : 'Cadastrar Produto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
