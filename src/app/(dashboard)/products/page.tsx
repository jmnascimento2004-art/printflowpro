'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus,
  Search,
  Trash2,
  Edit3,
  Copy,
  Package,
  Check,
  X,
  Layers,
  LayoutGrid,
  List as ListIcon,
  AlertTriangle,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Eraser
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Product, ProductConfiguratorGroup, ProductConfiguratorOption, ProductSaleMode } from '@/lib/dummy-data';
import { formatCurrencyInput, parseCurrencyInputToNumber, sanitizeRichTextHtml, stripRichTextHtml } from '@/lib/utils';
import { RichTextEditor } from '@/components/rich-text-editor';

function ProductDescriptionEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const syncValue = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

  const runCommand = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
    syncValue();
  };

  const clearFormatting = () => {
    editorRef.current?.focus();
    document.execCommand('removeFormat', false);
    syncValue();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    syncValue();
  };

  const toolbarItems = [
    { label: 'Negrito', icon: Bold, command: 'bold' },
    { label: 'Itálico', icon: Italic, command: 'italic' },
    { label: 'Sublinhado', icon: Underline, command: 'underline' },
    { label: 'Lista', icon: List, command: 'insertUnorderedList' },
    { label: 'Lista numerada', icon: ListOrdered, command: 'insertOrderedList' }
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-secondary/50 focus-within:border-primary/50">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-background/80 px-2 py-1.5">
        {toolbarItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.command}
              type="button"
              onClick={() => runCommand(item.command)}
              title={item.label}
              className="h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={clearFormatting}
          title="Limpar formatação"
          className="h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center"
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative">
        {!stripRichTextHtml(value) && (
          <span className="pointer-events-none absolute left-3 top-2 text-xs text-muted-foreground/70">
            Ex: Caneca para prensagem térmica. Estampa A4 inclusa.
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncValue}
          onBlur={() => onChange(sanitizeRichTextHtml(editorRef.current?.innerHTML || ''))}
          onPaste={handlePaste}
          className="min-h-[82px] w-full px-3 py-2 text-xs text-foreground outline-none rich-text-description"
        />
      </div>
    </div>
  );
}

void ProductDescriptionEditor;

const saleModeOptions: Array<{ value: ProductSaleMode; label: string; pricingType: Product['pricing_type'] }> = [
  { value: 'unidade', label: 'Unidade Simples', pricingType: 'unidade' },
  { value: 'm2', label: 'Metro Quadrado (m²)', pricingType: 'm2' },
  { value: 'linear', label: 'Metro Linear', pricingType: 'linear' },
  { value: 'width_height', label: 'Largura x Altura', pricingType: 'm2' },
  { value: 'pacote', label: 'Pacote / Kit', pricingType: 'pacote' },
  { value: 'size_grid', label: 'Grade de Tamanhos', pricingType: 'unidade' },
  { value: 'custom', label: 'Produto Personalizado', pricingType: 'unidade' }
];

const saleModeDescriptions: Record<ProductSaleMode, string> = {
  unidade: 'Use para cartões, panfletos, talões, brindes e produtos vendidos por quantidade.',
  m2: 'Use para banners, lonas, adesivos, placas, ACM, fachadas e comunicação visual por área.',
  linear: 'Use para adesivos em rolo, faixas e materiais vendidos por metro.',
  width_height: 'Use para produtos que precisam de largura e altura com limites mínimos, máximos ou área mínima cobrada.',
  pacote: 'Use para kits fechados, combos e pacotes com composição definida.',
  kit: 'Use para kits fechados, combos e pacotes com composição definida.',
  size_grid: 'Use para camisas, uniformes e produtos com tamanhos variados.',
  custom: 'Use para produtos sob consulta, projetos especiais e configurações que precisam de análise comercial.'
};

const defaultSizeOptions: ProductConfiguratorOption[] = ['P', 'M', 'G', 'GG', 'XG'].map((name) => ({
  name,
  price_delta: 0,
  additional_days: 0,
  is_default: false
}));

const buildEmptyOptionGroup = (): ProductConfiguratorGroup => ({
  id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  selection_type: 'single',
  required: false,
  options: []
});

const buildEmptyConfiguratorOption = (): ProductConfiguratorOption => ({
  name: '',
  price_delta: 0,
  additional_days: 0,
  is_default: false
});

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
    deleteCategory,
    settings
  } = useDatabase();

  const defaultProfitMargin = settings.profit_margin ?? 40;
  const defaultCommissionRate = settings.commission_rate ?? 5;
  const defaultTaxRate = settings.tax_rate ?? 6;

  const [viewMode, setViewMode] = useState<'products' | 'categories'>('products');
  const [productViewMode, setProductViewMode] = useState<'list' | 'cards'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Category management States
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catParentId, setCatParentId] = useState('');
  const [catShowInCatalog, setCatShowInCatalog] = useState(true);
  const [isCategoryEditing, setIsCategoryEditing] = useState(false);
  const [selectedCatId, setSelectedCatId] = useState('');

  const getProductCount = (catId: string) => {
    // Show count of products in this category, plus products in its subcategories if it is a parent category
    const subcategoryIds = categories.filter(c => c.parent_id === catId).map(c => c.id);
    return products.filter(p => p.category_id === catId || subcategoryIds.includes(p.category_id)).length;
  };

  const handleCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    if (isCategoryEditing) {
      updateCategory(selectedCatId, catName, catDescription, catParentId || null, catShowInCatalog);
      setIsCategoryEditing(false);
    } else {
      addCategory(catName, catDescription, catParentId || null, catShowInCatalog);
    }

    setCatName('');
    setCatDescription('');
    setCatParentId('');
    setCatShowInCatalog(true);
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
  const [, setActive] = useState(true);
  const [catalogActive, setCatalogActive] = useState(true);
  const [isPromo, setIsPromo] = useState(false);
  const [isHighlight, setIsHighlight] = useState(false);
  const [deliveryTime, setDeliveryTime] = useState('');

  // Advanced States
  const [imageUrl, setImageUrl] = useState('');
  const [volumePricing, setVolumePricing] = useState<Array<{ min_qty: number, price: number }>>([]);
  const [tempMinQty, setTempMinQty] = useState<number | ''>(2);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [tempTotalPrice, setTempTotalPrice] = useState<number>(0);
  const [variantOptions, setVariantOptions] = useState<Array<{ name: string }>>([]);
  const [colorOptions, setColorOptions] = useState<Array<{ name: string, hex?: string }>>([]);
  const [tempVariantName, setTempVariantName] = useState('');
  const [tempColorName, setTempColorName] = useState('');
  const [tempColorHex, setTempColorHex] = useState('#111827');
  const [saleMode, setSaleMode] = useState<ProductSaleMode>('unidade');
  const [allowCustomMeasure, setAllowCustomMeasure] = useState(true);
  const [minWidth, setMinWidth] = useState(0);
  const [minHeight, setMinHeight] = useState(0);
  const [maxWidth, setMaxWidth] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [minArea, setMinArea] = useState(0);
  const [minLength, setMinLength] = useState(0);
  const [kitItems, setKitItems] = useState('');
  const [configMinQuantity, setConfigMinQuantity] = useState(1);
  const [sizeOptions, setSizeOptions] = useState<ProductConfiguratorOption[]>(defaultSizeOptions);
  const [customSizeName, setCustomSizeName] = useState('');
  const [quoteOnRequest, setQuoteOnRequest] = useState(false);
  const [customerMessage, setCustomerMessage] = useState('');
  const [optionGroups, setOptionGroups] = useState<ProductConfiguratorGroup[]>([]);

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
  const [profitMargin, setProfitMargin] = useState(defaultProfitMargin);
  const [commissionPercent, setCommissionPercent] = useState(defaultCommissionRate);
  const [taxPercent, setTaxPercent] = useState(defaultTaxRate);

  useEffect(() => {
    if (isFormOpen && !isEditing) {
      setProfitMargin(defaultProfitMargin);
      setCommissionPercent(defaultCommissionRate);
      setTaxPercent(defaultTaxRate);
    }
  }, [defaultProfitMargin, defaultCommissionRate, defaultTaxRate, isFormOpen, isEditing]);

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
    if (qty < 1) {
      alert("A quantidade minima deve ser pelo menos 1.");
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

  const addVariantOption = () => {
    const value = tempVariantName.trim();
    if (!value) return;
    if (variantOptions.some(option => option.name.toLowerCase() === value.toLowerCase())) {
      alert('Esta variacao ja foi adicionada.');
      return;
    }
    setVariantOptions(prev => [...prev, { name: value }]);
    setTempVariantName('');
  };

  const addColorOption = () => {
    const value = tempColorName.trim();
    if (!value) return;
    if (colorOptions.some(option => option.name.toLowerCase() === value.toLowerCase())) {
      alert('Esta cor ja foi adicionada.');
      return;
    }
    setColorOptions(prev => [...prev, { name: value, hex: tempColorHex }]);
    setTempColorName('');
    setTempColorHex('#111827');
  };

  const getPricingTypeForSaleMode = (mode: ProductSaleMode): Product['pricing_type'] => {
    return saleModeOptions.find((option) => option.value === mode)?.pricingType || 'unidade';
  };

  const handleSaleModeChange = (mode: ProductSaleMode) => {
    setSaleMode(mode);
    setPricingType(getPricingTypeForSaleMode(mode));
  };

  const updateSizeOption = (index: number, patch: Partial<ProductConfiguratorOption>) => {
    setSizeOptions(prev => prev.map((option, idx) => (idx === index ? { ...option, ...patch } : option)));
  };

  const addCustomSizeOption = () => {
    const value = customSizeName.trim();
    if (!value) return;
    if (sizeOptions.some(option => option.name.toLowerCase() === value.toLowerCase())) {
      alert('Este tamanho ja foi adicionado.');
      return;
    }
    setSizeOptions(prev => [...prev, { ...buildEmptyConfiguratorOption(), name: value }]);
    setCustomSizeName('');
  };

  const updateOptionGroup = (groupId: string, patch: Partial<ProductConfiguratorGroup>) => {
    setOptionGroups(prev => prev.map(group => (group.id === groupId ? { ...group, ...patch } : group)));
  };

  const addOptionToGroup = (groupId: string) => {
    setOptionGroups(prev => prev.map(group => (
      group.id === groupId
        ? { ...group, options: [...group.options, buildEmptyConfiguratorOption()] }
        : group
    )));
  };

  const updateGroupOption = (
    groupId: string,
    optionIndex: number,
    patch: Partial<ProductConfiguratorOption>
  ) => {
    setOptionGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        options: group.options.map((option, idx) => (idx === optionIndex ? { ...option, ...patch } : option))
      };
    }));
  };

  const removeGroupOption = (groupId: string, optionIndex: number) => {
    setOptionGroups(prev => prev.map(group => (
      group.id === groupId
        ? { ...group, options: group.options.filter((_, idx) => idx !== optionIndex) }
        : group
    )));
  };

  const normalizeConfiguratorGroups = () => optionGroups
    .map(group => ({
      ...group,
      name: group.name.trim(),
      options: group.options
        .map(option => ({
          ...option,
          name: option.name.trim(),
          price_delta: Math.max(0, option.price_delta || 0),
          additional_days: Math.max(0, option.additional_days || 0)
        }))
        .filter(option => option.name)
    }))
    .filter(group => group.name && group.options.length > 0);

  const buildConfiguratorOptions = () => ({
    sale_mode: saleMode,
    allow_custom_measure: allowCustomMeasure,
    min_width: minWidth || undefined,
    min_height: minHeight || undefined,
    max_width: maxWidth || undefined,
    max_height: maxHeight || undefined,
    min_area: minArea || undefined,
    min_length: minLength || undefined,
    kit_items: kitItems.trim() || undefined,
    min_quantity: Math.max(1, configMinQuantity || 1),
    size_options: sizeOptions.filter(option => option.name.trim()),
    quote_on_request: quoteOnRequest,
    customer_message: customerMessage.trim() || undefined,
    option_groups: normalizeConfiguratorGroups()
  });

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    
    const selectedCategoryIds = selectedCategory === 'todos'
      ? []
      : [selectedCategory, ...categories.filter(c => c.parent_id === selectedCategory).map(c => c.id)];
    
    const matchesCategory = selectedCategory === 'todos' ? true : selectedCategoryIds.includes(p.category_id);

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
    setCatalogActive(true);
    setIsPromo(false);
    setIsHighlight(false);
    setDeliveryTime('');
    setImageUrl('');
    setVolumePricing([]);
    setVariantOptions([]);
    setColorOptions([]);
    setTempVariantName('');
    setTempColorName('');
    setTempColorHex('#111827');
    setSaleMode('unidade');
    setAllowCustomMeasure(true);
    setMinWidth(0);
    setMinHeight(0);
    setMaxWidth(0);
    setMaxHeight(0);
    setMinArea(0);
    setMinLength(0);
    setKitItems('');
    setConfigMinQuantity(1);
    setSizeOptions(defaultSizeOptions);
    setCustomSizeName('');
    setQuoteOnRequest(false);
    setCustomerMessage('');
    setOptionGroups([]);
    setTempMinQty(2);
    setTempPrice(0);
    setTempTotalPrice(0);
    setProfitMargin(defaultProfitMargin);
    setCommissionPercent(defaultCommissionRate);
    setTaxPercent(defaultTaxRate);
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
    setActive(true);
    setCatalogActive(prod.catalog_active ?? true);
    setIsPromo(prod.is_promo || false);
    setIsHighlight(prod.is_highlight || false);
    setDeliveryTime(prod.delivery_time || prod.pricing_details?.delivery_time || '');
    setImageUrl(prod.image_url || '');
    setVolumePricing(prod.volume_pricing || []);
    setVariantOptions(prod.variant_options || []);
    setColorOptions(prod.color_options || []);
    const configurator = prod.pricing_details?.configurator_options;
    setSaleMode(configurator?.sale_mode || prod.pricing_type);
    setAllowCustomMeasure(configurator?.allow_custom_measure !== false);
    setMinWidth(configurator?.min_width || 0);
    setMinHeight(configurator?.min_height || 0);
    setMaxWidth(configurator?.max_width || 0);
    setMaxHeight(configurator?.max_height || 0);
    setMinArea(configurator?.min_area || 0);
    setMinLength(configurator?.min_length || 0);
    setKitItems(configurator?.kit_items || '');
    setConfigMinQuantity(configurator?.min_quantity || 1);
    setSizeOptions(configurator?.size_options && configurator.size_options.length > 0 ? configurator.size_options : defaultSizeOptions);
    setCustomSizeName('');
    setQuoteOnRequest(configurator?.quote_on_request || false);
    setCustomerMessage(configurator?.customer_message || '');
    setOptionGroups(configurator?.option_groups || []);
    setTempVariantName('');
    setTempColorName('');
    setTempColorHex('#111827');
    setTempMinQty(2);
    setTempPrice(0);
    setTempTotalPrice(0);
    if (prod.pricing_details) {
      setProfitMargin(prod.pricing_details.markup || defaultProfitMargin);
      setCommissionPercent(prod.pricing_details.commission || defaultCommissionRate);
      setTaxPercent(prod.pricing_details.taxes || defaultTaxRate);
    } else {
      setProfitMargin(defaultProfitMargin);
      setCommissionPercent(defaultCommissionRate);
      setTaxPercent(defaultTaxRate);
    }
    setIsEditing(true);
    setIsFormOpen(true);
  };

  const handleDuplicateProduct = (prod: Product) => {
    const duplicated = addProduct({
      name: `${prod.name} (Copia)`,
      sku: `${prod.sku}-COPIA-${Math.floor(100 + Math.random() * 900)}`,
      description: prod.description,
      category_id: prod.category_id,
      pricing_type: prod.pricing_type,
      base_cost: prod.base_cost,
      sales_price: prod.sales_price,
      stock_controlled: prod.stock_controlled,
      min_stock: prod.min_stock,
      active: true,
      catalog_active: prod.catalog_active ?? true,
      is_promo: prod.is_promo || false,
      is_highlight: prod.is_highlight || false,
      delivery_time: prod.delivery_time || prod.pricing_details?.delivery_time,
      image_url: prod.image_url,
      volume_pricing: prod.volume_pricing ? [...prod.volume_pricing] : undefined,
      variant_options: prod.variant_options ? [...prod.variant_options] : undefined,
      color_options: prod.color_options ? [...prod.color_options] : undefined,
      pricing_details: prod.pricing_details
        ? { ...prod.pricing_details, delivery_time: prod.delivery_time || prod.pricing_details.delivery_time }
        : undefined
    });

    handleOpenEdit(duplicated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const usesRequiredVolumePricing = saleMode === 'unidade';
    const productVolumePricing = usesRequiredVolumePricing ? volumePricing : (volumePricing.length > 0 ? volumePricing : undefined);
    const cleanDeliveryTime = deliveryTime.trim();

    if (usesRequiredVolumePricing && volumePricing.length === 0) {
      alert('Adicione pelo menos uma opcao de quantidade para este produto.');
      return;
    }
    const cleanDescription = sanitizeRichTextHtml(description);
    const configuratorOptions = buildConfiguratorOptions();
    const pricingDetails = {
      raw_material_cost: baseCost,
      operating_cost: 0,
      production_time: 0,
      markup: profitMargin,
      commission: commissionPercent,
      taxes: taxPercent,
      waste_percent: 0,
      calculated_price: salesPrice,
      delivery_time: cleanDeliveryTime || undefined,
      configurator_options: configuratorOptions
    };

    if (isEditing && selectedProduct) {
      // Edit Product
      updateProduct({
        ...selectedProduct,
        name,
        sku: sku.trim() || `SKU-${pricingType.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        description: cleanDescription,
        category_id: categoryId,
        pricing_type: pricingType,
        base_cost: baseCost,
        sales_price: salesPrice,
        stock_controlled: stockControlled,
        min_stock: minStock,
        active: true,
        catalog_active: catalogActive,
        is_promo: isPromo,
        is_highlight: isHighlight,
        delivery_time: cleanDeliveryTime || undefined,
        image_url: imageUrl || undefined,
        volume_pricing: productVolumePricing,
        variant_options: variantOptions.length > 0 ? variantOptions : undefined,
        color_options: colorOptions.length > 0 ? colorOptions : undefined,
        pricing_details: pricingDetails
      });
    } else {
      // Create Product
      const newProd = addProduct({
        name,
        sku: sku.trim() || `SKU-${pricingType.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        description: cleanDescription,
        category_id: categoryId,
        pricing_type: pricingType,
        base_cost: baseCost,
        sales_price: salesPrice,
        stock_controlled: stockControlled,
        min_stock: minStock,
        active: true,
        catalog_active: catalogActive,
        is_promo: isPromo,
        is_highlight: isHighlight,
        delivery_time: cleanDeliveryTime || undefined,
        image_url: imageUrl || undefined,
        volume_pricing: productVolumePricing,
        variant_options: variantOptions.length > 0 ? variantOptions : undefined,
        color_options: colorOptions.length > 0 ? colorOptions : undefined,
        pricing_details: pricingDetails
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
                    {products.filter(p => p.catalog_active !== false).length}
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
                    {(() => {
                      const parents = categories.filter(c => !c.parent_id);
                      const options: React.ReactNode[] = [];
                      
                      parents.forEach(p => {
                        options.push(
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        );
                        
                        const children = categories.filter(c => c.parent_id === p.id);
                        children.forEach(c => {
                          options.push(
                            <option key={c.id} value={c.id}>
                              &nbsp;&nbsp;└─ {c.name}
                            </option>
                          );
                        });
                      });
                      
                      const orphans = categories.filter(c => c.parent_id && !categories.some(p => p.id === c.parent_id));
                      orphans.forEach(c => {
                        options.push(
                          <option key={c.id} value={c.id}>
                            &nbsp;&nbsp;└─ {c.name}
                          </option>
                        );
                      });
                      
                      return options;
                    })()}
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
                <div className="px-5 py-4 border-b border-border bg-secondary/10 flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                  <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Catalogo Geral de Produtos</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
                      <button
                        type="button"
                        onClick={() => setProductViewMode('list')}
                        title="Visualizar em lista"
                        className={`h-7 w-8 rounded-md flex items-center justify-center transition-colors ${
                          productViewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <ListIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductViewMode('cards')}
                        title="Visualizar em cards"
                        className={`h-7 w-8 rounded-md flex items-center justify-center transition-colors ${
                          productViewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-semibold whitespace-nowrap">Exibindo {filteredProducts.length} registros</span>
                  </div>
                </div>

                {productViewMode === 'list' ? (
                <div className="w-full overflow-x-auto">
                  <table className="w-full table-fixed text-left border-collapse text-xs">
                    <colgroup>
                      <col className="w-[8%]" />
                      <col className="w-[28%]" />
                      <col className="w-[10%]" />
                      <col className="w-[7%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[7%]" />
                      <col className="w-[7%]" />
                      <col className="w-[13%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-secondary/40 text-[9px] uppercase font-bold text-muted-foreground border-b border-border">
                        <th className="px-3 py-3 truncate">SKU / Codigo</th>
                        <th className="px-3 py-3">Produto / Servico</th>
                        <th className="px-3 py-3">Categoria</th>
                        <th className="px-3 py-3">Calculo</th>
                        <th className="px-3 py-3 text-right">Custo Base</th>
                        <th className="px-3 py-3 text-right">Preco de Venda</th>
                        <th className="px-3 py-3 text-center">Estoque</th>
                        <th className="px-3 py-3 text-center">Status</th>
                        <th className="px-2 py-3 text-center">Acoes</th>
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
                              <td className="px-3 py-3.5 font-bold text-foreground truncate" title={prod.sku}>{prod.sku}</td>

                              {/* Name & Description */}
                              <td className="px-3 py-3.5 min-w-0">
                                <div className="flex items-center gap-3 min-w-0">
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
                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                      <span className="truncate">{prod.name}</span>
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
                                    <div className="text-[10px] text-muted-foreground truncate" title={stripRichTextHtml(prod.description)}>
                                      {stripRichTextHtml(prod.description) || '-'}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Category Badge */}
                              <td className="px-3 py-3.5">
                                <span className="inline-block max-w-full truncate px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold" title={catName}>
                                  {catName}
                                </span>
                              </td>

                              {/* Pricing Type */}
                              <td className="px-3 py-3.5 text-muted-foreground font-semibold uppercase truncate">{prod.pricing_type}</td>

                              {/* Cost */}
                              <td className="px-3 py-3.5 text-right text-muted-foreground font-semibold whitespace-nowrap">
                                {formatCurrency(prod.base_cost)}
                              </td>

                              {/* Sale Price */}
                              <td className="px-3 py-3.5 text-right font-black text-foreground whitespace-nowrap">
                                {formatCurrency(prod.sales_price)}
                              </td>

                              {/* Stock Level */}
                              <td className="px-3 py-3.5 text-center">
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
                              <td className="px-3 py-3.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  prod.catalog_active !== false
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {prod.catalog_active !== false ? 'CATALOGO' : 'SOMENTE SAAS'}
                                </span>
                              </td>

                              {/* Actions */}
                              <td className="px-2 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleDuplicateProduct(prod)}
                                    className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20"
                                    title="Duplicar Produto"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>

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
                ) : (
                  <div className="p-3">
                    {filteredProducts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {filteredProducts.map((prod) => {
                          const belowMin = prod.stock_controlled && prod.current_stock < prod.min_stock;
                          const catName = categories.find(c => c.id === prod.category_id)?.name || 'Outros';

                          return (
                            <div key={prod.id} className="rounded-xl border border-border bg-background p-3 shadow-sm hover:border-primary/30 transition-colors">
                              <div className="flex items-start gap-3">
                                {prod.image_url ? (
                                  <img
                                    src={prod.image_url}
                                    alt={prod.name}
                                    className="h-12 w-12 rounded-lg object-cover border border-border bg-card shrink-0"
                                  />
                                ) : (
                                  <div className="h-12 w-12 rounded-lg bg-secondary/50 flex items-center justify-center border border-border text-muted-foreground shrink-0">
                                    <Package className="h-5 w-5" />
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <h4 className="text-xs font-black text-foreground truncate" title={prod.name}>{prod.name}</h4>
                                      <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={stripRichTextHtml(prod.description)}>
                                        {stripRichTextHtml(prod.description) || '-'}
                                      </p>
                                    </div>
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-black border ${
                                      prod.catalog_active !== false
                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                    }`}>
                                      {prod.catalog_active !== false ? 'CATALOGO' : 'SAAS'}
                                    </span>
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span className="max-w-[120px] truncate px-2 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold" title={catName}>
                                      {catName}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-secondary text-muted-foreground text-[9px] font-bold uppercase">
                                      {prod.pricing_type}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                                <div>
                                  <span className="block text-muted-foreground font-bold uppercase">Custo</span>
                                  <strong className="text-foreground">{formatCurrency(prod.base_cost)}</strong>
                                </div>
                                <div>
                                  <span className="block text-muted-foreground font-bold uppercase">Venda</span>
                                  <strong className="text-foreground">{formatCurrency(prod.sales_price)}</strong>
                                </div>
                                <div>
                                  <span className="block text-muted-foreground font-bold uppercase">Estoque</span>
                                  <strong className={belowMin ? 'text-rose-500' : 'text-foreground'}>
                                    {prod.stock_controlled ? prod.current_stock : 'Sem'}
                                  </strong>
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleDuplicateProduct(prod)}
                                  className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/20"
                                  title="Duplicar Produto"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenEdit(prod)}
                                  className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                  title="Editar Produto"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Excluir o produto "${prod.name}" do catalogo do ERP?`)) {
                                      deleteProduct(prod.id);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/25 border border-rose-500/20"
                                  title="Excluir Produto"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-5 py-8 text-center text-muted-foreground italic text-xs">
                        Nenhum produto encontrado.
                      </div>
                    )}
                  </div>
                )}
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
                    <label className="text-xs font-semibold text-muted-foreground">Categoria Pai (Opcional)</label>
                    <select
                      value={catParentId}
                      onChange={(e) => setCatParentId(e.target.value)}
                      className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none font-medium"
                    >
                      <option value="">Nenhuma (Esta será uma categoria pai)</option>
                      {categories.filter(c => (!selectedCatId || c.id !== selectedCatId) && !c.parent_id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Exibir no Catálogo</label>
                    <select
                      value={catShowInCatalog ? 'sim' : 'nao'}
                      onChange={(e) => setCatShowInCatalog(e.target.value === 'sim')}
                      className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none font-medium"
                    >
                      <option value="sim">Exibir categoria no catálogo</option>
                      <option value="nao">Não exibir categoria no catálogo</option>
                    </select>
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
                          setCatParentId('');
                          setCatShowInCatalog(true);
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
                      {(() => {
                        const parents = categories.filter(c => !c.parent_id);
                        const renderedRows: React.ReactNode[] = [];
                        
                        parents.forEach(parent => {
                          const parentCount = getProductCount(parent.id);
                          
                          // Render Parent Category row
                          renderedRows.push(
                            <tr key={parent.id} className="bg-secondary/10 hover:bg-secondary/20 transition-colors font-bold border-l-2 border-primary">
                              <td className="px-5 py-3.5 font-bold text-foreground flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 text-[8px] bg-primary/20 text-primary border border-primary/20 rounded font-black uppercase">PAI</span>
                                <span>{parent.name}</span>
                              </td>
                              <td className="px-5 py-3.5 text-muted-foreground max-w-xs truncate font-medium">{parent.description || '-'}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-foreground">
                                <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground border border-border">
                                  {parentCount} {parentCount === 1 ? 'produto' : 'produtos'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setIsCategoryEditing(true);
                                      setSelectedCatId(parent.id);
                                      setCatName(parent.name);
                                      setCatDescription(parent.description || '');
                                      setCatParentId(parent.parent_id || '');
                                      setCatShowInCatalog(parent.show_in_catalog !== false);
                                    }}
                                    className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                    title="Editar Categoria"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      const count = getProductCount(parent.id);
                                      if (count > 0) {
                                        alert(`Não é possível excluir a categoria "${parent.name}" porque ela possui ${count} produto(s) associado(s).`);
                                        return;
                                      }
                                      if (confirm(`Deseja realmente excluir a categoria "${parent.name}"?`)) {
                                        deleteCategory(parent.id);
                                        if (selectedCatId === parent.id) {
                                          setIsCategoryEditing(false);
                                          setCatName('');
                                          setCatDescription('');
                                          setCatParentId('');
                                          setCatShowInCatalog(true);
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
                          
                          // Render Child Categories rows
                          const children = categories.filter(c => c.parent_id === parent.id);
                          children.forEach(child => {
                            const childCount = products.filter(p => p.category_id === child.id).length;
                            renderedRows.push(
                              <tr key={child.id} className="hover:bg-secondary/15 transition-colors">
                                <td className="px-5 py-3.5 font-medium text-foreground pl-10">
                                  <span className="text-muted-foreground mr-1">└─</span>
                                  <span>{child.name}</span>
                                </td>
                                <td className="px-5 py-3.5 text-muted-foreground max-w-xs truncate">{child.description || '-'}</td>
                                <td className="px-5 py-3.5 text-center font-bold text-foreground">
                                  <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground border border-border">
                                    {childCount} {childCount === 1 ? 'produto' : 'produtos'}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        setIsCategoryEditing(true);
                                        setSelectedCatId(child.id);
                                        setCatName(child.name);
                                        setCatDescription(child.description || '');
                                        setCatParentId(child.parent_id || '');
                                        setCatShowInCatalog(child.show_in_catalog !== false);
                                      }}
                                      className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                      title="Editar Categoria"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    
                                    <button
                                      onClick={() => {
                                        const count = products.filter(p => p.category_id === child.id).length;
                                        if (count > 0) {
                                          alert(`Não é possível excluir a categoria "${child.name}" porque ela possui ${count} produto(s) associado(s).`);
                                          return;
                                        }
                                        if (confirm(`Deseja realmente excluir a categoria "${child.name}"?`)) {
                                          deleteCategory(child.id);
                                          if (selectedCatId === child.id) {
                                            setIsCategoryEditing(false);
                                            setCatName('');
                                            setCatDescription('');
                                            setCatParentId('');
                                            setCatShowInCatalog(true);
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
                          });
                        });
                        
                        // Handle orphans
                        const orphans = categories.filter(c => c.parent_id && !categories.some(p => p.id === c.parent_id));
                        orphans.forEach(child => {
                          const childCount = products.filter(p => p.category_id === child.id).length;
                          renderedRows.push(
                            <tr key={child.id} className="hover:bg-secondary/15 transition-colors">
                              <td className="px-5 py-3.5 font-medium text-foreground pl-10">
                                <span className="text-muted-foreground mr-1">└─</span>
                                <span>{child.name}</span>
                              </td>
                              <td className="px-5 py-3.5 text-muted-foreground max-w-xs truncate">{child.description || '-'}</td>
                              <td className="px-5 py-3.5 text-center font-bold text-foreground">
                                <span className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground border border-border">
                                  {childCount} {childCount === 1 ? 'produto' : 'produtos'}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setIsCategoryEditing(true);
                                      setSelectedCatId(child.id);
                                      setCatName(child.name);
                                      setCatDescription(child.description || '');
                                      setCatParentId(child.parent_id || '');
                                      setCatShowInCatalog(child.show_in_catalog !== false);
                                    }}
                                    className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border"
                                    title="Editar Categoria"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  
                                  <button
                                    onClick={() => {
                                      const count = products.filter(p => p.category_id === child.id).length;
                                      if (count > 0) {
                                        alert(`Não é possível excluir a categoria "${child.name}" porque ela possui ${count} produto(s) associado(s).`);
                                        return;
                                      }
                                      if (confirm(`Deseja realmente excluir a categoria "${child.name}"?`)) {
                                        deleteCategory(child.id);
                                        if (selectedCatId === child.id) {
                                          setIsCategoryEditing(false);
                                          setCatName('');
                                          setCatDescription('');
                                          setCatParentId('');
                                          setCatShowInCatalog(true);
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
                        });
                        
                        if (renderedRows.length > 0) return renderedRows;
                        
                        return (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground italic">
                              Nenhuma categoria cadastrada.
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="max-w-5xl mx-auto bg-card border border-border shadow-md rounded-2xl overflow-hidden p-6 no-print w-full animate-in slide-in-from-bottom duration-300">
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

            <div className="flex flex-col gap-4 py-1">
              <section className="order-1 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">1. Informações do Produto</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Dados principais usados no cadastro interno, identificação e organização do produto.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  {(() => {
                    const parents = categories.filter(c => !c.parent_id);
                    const options: React.ReactNode[] = [];
                    
                    parents.forEach(p => {
                      options.push(
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      );
                      
                      const children = categories.filter(c => c.parent_id === p.id);
                      children.forEach(c => {
                        options.push(
                          <option key={c.id} value={c.id}>
                            &nbsp;&nbsp;└─ {c.name}
                          </option>
                        );
                      });
                    });
                    
                    const orphans = categories.filter(c => c.parent_id && !categories.some(p => p.id === c.parent_id));
                    orphans.forEach(c => {
                      options.push(
                        <option key={c.id} value={c.id}>
                          &nbsp;&nbsp;└─ {c.name}
                        </option>
                      );
                    });
                    
                    return options;
                  })()}
                </select>
              </div>
                </div>
              </section>

              {/* Online sale configurator */}
              <section className="order-2 rounded-2xl border border-primary/15 bg-white p-4 shadow-sm space-y-4">
                <div className="flex flex-col gap-1 border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">2. Modelo de Venda</span>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Escolha o modelo comercial usado para vender este produto e veja abaixo a orientação correspondente.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Como este produto será vendido?</label>
                    <select
                      value={saleMode}
                      onChange={(e) => handleSaleModeChange(e.target.value as ProductSaleMode)}
                      className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                    >
                      {saleModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className="rounded-lg border border-primary/10 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                      {saleModeDescriptions[saleMode]}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-secondary/10 p-3 space-y-3">
                    {saleMode === 'unidade' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                        <div className="rounded-lg bg-white border border-border p-3">
                          <span className="font-bold text-foreground block">Preço de venda</span>
                          <span className="text-muted-foreground">Usa o preço final sugerido e a tabela por quantidade.</span>
                        </div>
                        <div className="rounded-lg bg-white border border-border p-3">
                          <span className="font-bold text-foreground block">Atacado, variações e cores</span>
                          <span className="text-muted-foreground">Configure abaixo as faixas, variações simples e cores.</span>
                        </div>
                      </div>
                    )}

                    {(saleMode === 'm2' || saleMode === 'width_height') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Largura mínima (cm)</label>
                          <input type="number" min="0" value={minWidth} onChange={(e) => setMinWidth(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Altura mínima (cm)</label>
                          <input type="number" min="0" value={minHeight} onChange={(e) => setMinHeight(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Área mínima cobrada (m²)</label>
                          <input type="number" min="0" step="0.01" value={minArea} onChange={(e) => setMinArea(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        {saleMode === 'width_height' && (
                          <>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase">Largura máxima (cm)</label>
                              <input type="number" min="0" value={maxWidth} onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase">Altura máxima (cm)</label>
                              <input type="number" min="0" value={maxHeight} onChange={(e) => setMaxHeight(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                            </div>
                          </>
                        )}
                        <label className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 text-[11px] font-bold text-foreground">
                          <input type="checkbox" checked={allowCustomMeasure} onChange={(e) => setAllowCustomMeasure(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
                          Permitir medida personalizada no catálogo
                        </label>
                      </div>
                    )}

                    {saleMode === 'linear' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Metragem mínima (m)</label>
                          <input type="number" min="0" step="0.01" value={minLength} onChange={(e) => setMinLength(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <label className="flex items-center gap-2 text-[11px] font-bold text-foreground self-end pb-2">
                          <input type="checkbox" checked={allowCustomMeasure} onChange={(e) => setAllowCustomMeasure(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
                          Permitir metragem personalizada no catálogo
                        </label>
                      </div>
                    )}

                    {(saleMode === 'pacote' || saleMode === 'kit') && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Itens inclusos no kit</label>
                          <textarea value={kitItems} onChange={(e) => setKitItems(e.target.value)} placeholder="Ex: 1 banner, 2 adesivos, instalação inclusa..." className="min-h-[82px] w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Quantidade mínima</label>
                          <input type="number" min="1" value={configMinQuantity} onChange={(e) => setConfigMinQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground text-center font-bold" />
                          <p className="text-[10px] text-muted-foreground">Preço fixo usa o preço final sugerido.</p>
                        </div>
                      </div>
                    )}

                    {saleMode === 'size_grid' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {sizeOptions.map((option, index) => (
                            <div key={`${option.name}-${index}`} className="rounded-lg border border-border bg-white p-2 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black text-foreground">{option.name}</span>
                                <label className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
                                  <input type="checkbox" checked={option.is_default} onChange={(e) => updateSizeOption(index, { is_default: e.target.checked })} />
                                  Padrão
                                </label>
                              </div>
                              <input type="text" value={formatCurrencyInput(option.price_delta)} onChange={(e) => updateSizeOption(index, { price_delta: parseCurrencyInputToNumber(e.target.value) })} className="w-full px-2 py-1.5 rounded border border-border bg-secondary/30 text-[11px] font-bold text-foreground" />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input value={customSizeName} onChange={(e) => setCustomSizeName(e.target.value)} placeholder="Adicionar tamanho personalizado" className="flex-1 px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                          <button type="button" onClick={addCustomSizeOption} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold">Adicionar</button>
                        </div>
                      </div>
                    )}

                    {saleMode === 'custom' && (
                      <div className="grid grid-cols-1 gap-3">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-foreground">
                          <input type="checkbox" checked={quoteOnRequest} onChange={(e) => setQuoteOnRequest(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
                          Permitir orçamento sob consulta
                        </label>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Mensagem para o cliente</label>
                          <textarea value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} placeholder="Ex: Envie sua ideia e nossa equipe prepara uma proposta personalizada." className="min-h-[78px] w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Pricing Type */}
              <div className="hidden">
                <label className="text-xs font-semibold text-muted-foreground">Como este produto será vendido?</label>
                <select
                  value={pricingType}
                  disabled
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="unidade">Unidade Simples</option>
                  <option value="m2">Metro Quadrado (m²)</option>
                  <option value="linear">Metro Linear</option>
                  <option value="pacote">Pacote / Kit</option>
                </select>
              </div>

              <section className="order-5 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">5. Catálogo Online</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Controle como este produto aparece para o cliente no catálogo.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status active */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Status do Produto</label>
                <select
                  value={catalogActive ? 'catalogo' : 'saas'}
                  onChange={(e) => {
                    setActive(true);
                    setCatalogActive(e.target.value === 'catalogo');
                  }}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                >
                  <option value="catalogo">Ativo no Catálogo</option>
                  <option value="saas">Ativo apenas no SaaS</option>
                </select>
              </div>

              {/* Tags Destaque e Promoção */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Prazo de Entrega</label>
                <input
                  type="text"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  placeholder="Ex: Até 2 dias úteis"
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-xs text-foreground focus:outline-none"
                />
                <span className="text-[9px] text-muted-foreground block">
                  Esta informação aparece no card do produto no catálogo online.
                </span>
              </div>

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
                </div>
              </section>

              <section className="order-6 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">6. Upload e Instruções</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Imagem, prévia visual e instruções do produto para produção e apresentação.
                  </p>
                </div>

              {/* Product Image Attachment */}
              <div className="space-y-1">
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

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Descrição / Detalhes de Produção</label>
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  placeholder="Detalhes sobre o produto, aplicacao, materiais..."
                  minHeightClass="min-h-[136px]"
                />
              </div>
              </section>

              <section className="order-4 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">4. Precificação</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Custos, preço de venda, margens e regras de preço por quantidade.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
              </section>

              <section className="order-3 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">3. Configurador do Produto</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Variações, cores e grupos de opções usados para montar o produto no catálogo online.
                  </p>
                </div>

              {/* Variations and colors */}
              <div className="space-y-3">
                <div>
                  <span className="font-bold text-xs text-foreground block">Variacoes e Cores do Produto</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">
                    Opcional: estas opcoes aparecem no catalogo e entram nas observacoes do orcamento.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-secondary/15 p-3 rounded-xl border border-border space-y-2">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Variacoes</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tempVariantName}
                        onChange={(e) => setTempVariantName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addVariantOption();
                          }
                        }}
                        placeholder="Ex: Fosco, Brilho, Frente e verso"
                        className="flex-1 px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                      />
                      <button
                        type="button"
                        onClick={addVariantOption}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                    {variantOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {variantOptions.map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() => setVariantOptions(prev => prev.filter(item => item.name !== option.name))}
                            className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20"
                            title="Clique para remover"
                          >
                            {option.name} x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-secondary/15 p-3 rounded-xl border border-border space-y-2">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Cores</label>
                    <div className="grid grid-cols-[44px_1fr_40px] gap-2">
                      <input
                        type="color"
                        value={tempColorHex}
                        onChange={(e) => setTempColorHex(e.target.value)}
                        className="h-8 w-11 rounded-lg border border-border bg-background p-1"
                      />
                      <input
                        type="text"
                        value={tempColorName}
                        onChange={(e) => setTempColorName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addColorOption();
                          }
                        }}
                        placeholder="Ex: Azul, Preto, Vermelho"
                        className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                      />
                      <button
                        type="button"
                        onClick={addColorOption}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                    {colorOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {colorOptions.map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() => setColorOptions(prev => prev.filter(item => item.name !== option.name))}
                            className="px-2 py-1 rounded-lg bg-secondary text-foreground text-[10px] font-bold border border-border inline-flex items-center gap-1.5"
                            title="Clique para remover"
                          >
                            <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: option.hex || '#111827' }} />
                            {option.name} x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Product option groups */}
              <div className="md:col-span-2 border-t border-border/60 pt-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="font-bold text-xs text-foreground block">Grupos de Opções do Produto</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5 block">
                      Prepare materiais, acabamentos, extras, prazos e outras escolhas para o futuro configurador online.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOptionGroups(prev => [...prev, buildEmptyOptionGroup()])}
                    className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
                  >
                    + Adicionar Grupo
                  </button>
                </div>

                {optionGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-secondary/10 px-4 py-5 text-center text-xs text-muted-foreground">
                    Nenhum grupo configurado. Exemplos: Material, Tamanho, Cores, Acabamento, Extras, Prazo, Instalação e Arte.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {optionGroups.map((group) => (
                      <div key={group.id} className="rounded-xl border border-border bg-secondary/10 p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_120px_36px] gap-2 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Nome do grupo</label>
                            <input
                              type="text"
                              value={group.name}
                              onChange={(e) => updateOptionGroup(group.id, { name: e.target.value })}
                              placeholder="Ex: Acabamento"
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Seleção</label>
                            <select
                              value={group.selection_type}
                              onChange={(e) => updateOptionGroup(group.id, { selection_type: e.target.value as 'single' | 'multiple' })}
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground"
                            >
                              <option value="single">Única</option>
                              <option value="multiple">Múltipla</option>
                            </select>
                          </div>
                          <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-[11px] font-bold text-foreground">
                            <input
                              type="checkbox"
                              checked={group.required}
                              onChange={(e) => updateOptionGroup(group.id, { required: e.target.checked })}
                              className="h-4 w-4 rounded border-border text-primary"
                            />
                            Obrigatório
                          </label>
                          <button
                            type="button"
                            onClick={() => setOptionGroups(prev => prev.filter(item => item.id !== group.id))}
                            className="h-9 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500 flex items-center justify-center"
                            title="Remover grupo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-2">
                          {group.options.map((option, optionIndex) => (
                            <div key={optionIndex} className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_110px_36px] gap-2 items-end rounded-lg bg-white border border-border p-2">
                              <input
                                type="text"
                                value={option.name}
                                onChange={(e) => updateGroupOption(group.id, optionIndex, { name: e.target.value })}
                                placeholder="Nome da opcao"
                                className="px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-foreground"
                              />
                              <input
                                type="text"
                                value={formatCurrencyInput(option.price_delta)}
                                onChange={(e) => updateGroupOption(group.id, optionIndex, { price_delta: parseCurrencyInputToNumber(e.target.value) })}
                                className="px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-foreground font-bold"
                                title="Acrescimo em R$"
                              />
                              <input
                                type="number"
                                min="0"
                                value={option.additional_days}
                                onChange={(e) => updateGroupOption(group.id, optionIndex, { additional_days: Math.max(0, Number(e.target.value) || 0) })}
                                className="px-3 py-2 bg-secondary/30 border border-border rounded-lg text-xs text-foreground font-bold"
                                title="Prazo adicional em dias"
                              />
                              <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={option.is_default}
                                  onChange={(e) => updateGroupOption(group.id, optionIndex, { is_default: e.target.checked })}
                                />
                                  Padrão
                              </label>
                              <button
                                type="button"
                                onClick={() => removeGroupOption(group.id, optionIndex)}
                                className="h-9 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500 flex items-center justify-center"
                                title="Remover opção"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addOptionToGroup(group.id)}
                            className="w-full rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10"
                          >
                            + Adicionar opção neste grupo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </section>

              {/* Stock control configurations */}
              <section className="order-7 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">7. Estoque</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Controle de estoque, alerta mínimo e lançamento inicial quando aplicável.
                  </p>
                </div>

              <div className="flex items-center justify-between gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
              )}
              </section>
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
