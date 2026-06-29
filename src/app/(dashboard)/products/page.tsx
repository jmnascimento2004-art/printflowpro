'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus,
  Search,
  Trash2,
  Edit3,
  Copy,
  Package,
  Printer,
  Check,
  X,
  Layers,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Eraser
} from 'lucide-react';
import { useDatabase } from '@/context/database-context';
import { Product, ProductConfiguratorGroup, ProductConfiguratorOption, ProductGalleryImage, ProductSaleMode, VariantPricingMatrixRow } from '@/lib/dummy-data';
import {
  formatCurrencyInput,
  parseCurrencyInputToNumber,
  parseUnitCurrencyInputToNumber,
  sanitizeRichTextHtml,
  stripRichTextHtml
} from '@/lib/utils';
import {
  formatUnitCurrency,
  getNormalizedVariantPricingMatrix,
  getNormalizedVolumePricing,
  getProductQuantityTierSummary,
  NormalizedVolumePriceTier
} from '@/lib/pricing';
import { RichTextEditor } from '@/components/rich-text-editor';
import { ProductBarcode } from '@/components/products/ProductBarcode';
import { ProductLabelPreview, ProductLabelSize, productLabelSizes } from '@/components/products/ProductLabelPreview';
import { supabase } from '@/lib/supabaseClient';
import {
  MAX_PRODUCT_GALLERY_IMAGES,
  PRODUCT_IMAGE_BUCKET,
  getPrimaryProductImage,
  normalizeProductGallery,
  prepareProductGallery,
  uploadProductImage,
  validateProductGalleryLimit,
  validateProductImage
} from '@/lib/product-images';

type ProductSaleModeDraft = ProductSaleMode | 'linear_width';

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

const saleModeOptions: Array<{ value: ProductSaleModeDraft; label: string; pricingType: Product['pricing_type'] }> = [
  { value: 'unidade', label: 'Unidade Simples', pricingType: 'unidade' },
  { value: 'volume', label: 'Preco por Quantidade / Lote', pricingType: 'unidade' },
  { value: 'm2', label: 'Metro Quadrado (m²)', pricingType: 'm2' },
  { value: 'linear_width', label: 'Metro Linear com Largura Maxima', pricingType: 'linear' },
  { value: 'linear', label: 'Comprimento Linear Simples', pricingType: 'linear' },
  { value: 'width_height', label: 'Largura x Altura', pricingType: 'm2' },
  { value: 'pacote', label: 'Pacote / Kit', pricingType: 'pacote' },
  { value: 'size_grid', label: 'Produto com Variacoes', pricingType: 'unidade' },
  { value: 'custom', label: 'Produto Personalizado', pricingType: 'unidade' }
];

const saleModeDescriptions: Record<ProductSaleModeDraft, string> = {
  unidade: 'Use para produtos vendidos por unidade, sem tabela de tiragem ou lote.',
  volume: 'Use para panfletos, cartoes, taloes, folders e impressos vendidos por quantidade/lote.',
  m2: 'Use para banners, lonas, adesivos, placas, ACM, fachadas e comunicação visual por área.',
  linear_width: 'Use para bobinas, vinil, lona, manta, chapas e materiais com largura maxima e comprimento livre.',
  linear: 'Use para perfis, tubos, reguas e materiais vendidos apenas por comprimento.',
  width_height: 'Use para produtos que precisam de largura e altura com limites mínimos, máximos ou área mínima cobrada.',
  pacote: 'Use para kits fechados, combos e pacotes com composição definida.',
  kit: 'Use para kits fechados, combos e pacotes com composição definida.',
  size_grid: 'Use para camisas, uniformes e produtos com tamanhos variados.',
  custom: 'Use para produtos sob consulta, projetos especiais e configurações que precisam de análise comercial.'
};

type ConfiguratorInterfaceField = {
  label: string;
  placeholder?: string;
  kind?: 'input' | 'toggle' | 'chip';
};

type ProductRegistrationType = 'simple_unit' | 'measured' | 'tiered' | 'service' | 'custom_project';

const registrationTypeCards: Array<{
  value: ProductRegistrationType;
  title: string;
  description: string;
  examples: string;
  defaultSaleMode: ProductSaleMode;
}> = [
  {
    value: 'simple_unit',
    title: 'Produto simples',
    description: 'Venda por unidade, com preco fixo.',
    examples: 'Caneca, camisa, cartao simples, item pronto.',
    defaultSaleMode: 'unidade'
  },
  {
    value: 'measured',
    title: 'Produto por medida',
    description: 'Venda por largura, altura, m2 ou metro linear.',
    examples: 'Lona, adesivo, ACM, fachada, grade, movel.',
    defaultSaleMode: 'm2'
  },
  {
    value: 'tiered',
    title: 'Produto por tiragem/lote',
    description: 'Venda com tabela de preco por quantidade.',
    examples: 'Panfletos, cartoes, folders, taloes.',
    defaultSaleMode: 'volume'
  },
  {
    value: 'service',
    title: 'Servico',
    description: 'Servico sem estoque fisico.',
    examples: 'Arte final, instalacao, manutencao, solda, corte.',
    defaultSaleMode: 'custom'
  },
  {
    value: 'custom_project',
    title: 'Projeto sob medida',
    description: 'Orcamentos personalizados com material, mao de obra e medidas.',
    examples: 'Portao, balcao, movel planejado, fachada completa.',
    defaultSaleMode: 'custom'
  }
];

const saleModeOperatorGuidance: Record<ProductSaleModeDraft, {
  title: string;
  impact: string;
  catalog: string;
}> = {
  unidade: {
    title: 'Unidade simples',
    impact: 'Use quando o cliente compra uma unidade ou uma quantidade livre pelo mesmo preco unitario.',
    catalog: 'No catalogo aparece o preco unitario informado no campo Preco Final de Venda.'
  },
  volume: {
    title: 'Preco por quantidade/lote',
    impact: 'Use para panfletos, cartoes, taloes, folders e impressos por tiragem.',
    catalog: 'No catalogo aparece A partir de, quantidade minima, preco por unidade e total do lote.'
  },
  m2: {
    title: 'Sob medida por m2',
    impact: 'Use para banners, placas, adesivos, lonas e materiais calculados por largura x altura.',
    catalog: 'No catalogo o cliente informa medidas e o sistema calcula pela area.'
  },
  linear_width: {
    title: 'Metro linear com largura maxima',
    impact: 'Use quando o material tem largura maxima de bobina/chapa e o cliente informa largura e comprimento.',
    catalog: 'No catalogo o cliente informa largura e altura/comprimento. O sistema bloqueia largura acima do limite.'
  },
  linear: {
    title: 'Comprimento linear simples',
    impact: 'Use quando o cliente informa apenas o comprimento, sem largura de material.',
    catalog: 'No catalogo o cliente informa a metragem e o sistema calcula pelo comprimento.'
  },
  width_height: {
    title: 'Largura x altura',
    impact: 'Use quando o produto precisa de limites minimos, maximos ou area minima cobrada.',
    catalog: 'No catalogo o cliente informa largura e altura dentro das regras configuradas.'
  },
  pacote: {
    title: 'Pacote / kit',
    impact: 'Use para combos fechados com itens inclusos e preco fixo.',
    catalog: 'No catalogo aparece o preco do kit e a composicao descrita.'
  },
  kit: {
    title: 'Pacote / kit',
    impact: 'Use para combos fechados com itens inclusos e preco fixo.',
    catalog: 'No catalogo aparece o preco do kit e a composicao descrita.'
  },
  size_grid: {
    title: 'Produto com variacoes',
    impact: 'Use quando o cliente precisa escolher tamanho, cor, acabamento ou outro atributo.',
    catalog: 'No catalogo aparecem as opcoes configuradas antes de adicionar ao carrinho.'
  },
  custom: {
    title: 'Produto personalizado',
    impact: 'Use para produtos sob consulta ou projetos que precisam de analise comercial.',
    catalog: 'No catalogo o cliente envia a solicitacao com a mensagem configurada.'
  }
};

const configuratorInterfaceFields: Record<ProductSaleModeDraft, ConfiguratorInterfaceField[]> = {
  unidade: [
    { label: 'Material', placeholder: 'Ex: Couchê, Offset, PVC' },
    { label: 'Tamanho', placeholder: 'Ex: 15x21 cm, A4, personalizado' },
    { label: 'Impressão', placeholder: 'Ex: 4x0, 4x4, PB' },
    { label: 'Acabamento', placeholder: 'Ex: Verniz, laminação, corte' },
    { label: 'Extras', placeholder: 'Ex: Arte, embalagem, urgência' }
  ],
  volume: [
    { label: 'Quantidade minima', placeholder: 'Ex: 1000 un' },
    { label: 'Preco unitario', placeholder: 'Ex: R$ 0,13' },
    { label: 'Preco total do lote', placeholder: 'Ex: R$ 130,00' },
    { label: 'Prazo por tiragem', placeholder: 'Ex: Ate 3 dias uteis' }
  ],
  m2: [
    { label: 'Preço por m²', placeholder: 'R$ 0,00' },
    { label: 'Área mínima', placeholder: 'Ex: 1 m²' },
    { label: 'Largura mínima', placeholder: 'Ex: 50 cm' },
    { label: 'Altura mínima', placeholder: 'Ex: 50 cm' },
    { label: 'Permitir medida personalizada', kind: 'toggle' }
  ],
  linear_width: [
    { label: 'Valor do metro linear', placeholder: 'R$ 0,00' },
    { label: 'Largura maxima', placeholder: 'Ex: 1,20 m' },
    { label: 'Largura solicitada', placeholder: 'Ex: 0,80 m' },
    { label: 'Altura/comprimento', placeholder: 'Ex: 3,00 m' },
    { label: 'Cobranca minima opcional', placeholder: 'Ex: 1 m2' }
  ],
  linear: [
    { label: 'Preço por metro', placeholder: 'R$ 0,00' },
    { label: 'Comprimento mínimo', placeholder: 'Ex: 1 metro' }
  ],
  width_height: [
    { label: 'Preço por m²', placeholder: 'R$ 0,00' },
    { label: 'Área mínima', placeholder: 'Ex: 1 m²' },
    { label: 'Largura mínima', placeholder: 'Ex: 50 cm' },
    { label: 'Altura mínima', placeholder: 'Ex: 50 cm' },
    { label: 'Permitir medida personalizada', kind: 'toggle' }
  ],
  pacote: [
    { label: 'Preço fixo do kit', placeholder: 'R$ 0,00' },
    { label: 'Itens inclusos', placeholder: 'Ex: 1 banner + 1 suporte' },
    { label: 'Quantidade mínima', placeholder: 'Ex: 1 kit' }
  ],
  kit: [
    { label: 'Preço fixo do kit', placeholder: 'R$ 0,00' },
    { label: 'Itens inclusos', placeholder: 'Ex: 1 banner + 1 suporte' },
    { label: 'Quantidade mínima', placeholder: 'Ex: 1 kit' }
  ],
  size_grid: [
    { label: 'PP', kind: 'chip' },
    { label: 'P', kind: 'chip' },
    { label: 'M', kind: 'chip' },
    { label: 'G', kind: 'chip' },
    { label: 'GG', kind: 'chip' },
    { label: 'XG', kind: 'chip' }
  ],
  custom: [
    { label: 'Preço base', placeholder: 'R$ 0,00' },
    { label: 'Orçamento sob consulta', kind: 'toggle' },
    { label: 'Mensagem para o cliente', placeholder: 'Ex: Envie sua ideia para análise' }
  ]
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
    settings,
    company
  } = useDatabase();

  const defaultProfitMargin = settings.profit_margin ?? 40;
  const defaultCommissionRate = settings.commission_rate ?? 5;
  const defaultTaxRate = settings.tax_rate ?? 6;

  const [viewMode, setViewMode] = useState<'products' | 'categories'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLabelsModalOpen, setIsLabelsModalOpen] = useState(false);
  const [labelProductId, setLabelProductId] = useState('');
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelSize, setLabelSize] = useState<ProductLabelSize>('small');
  const [labelShowPrice, setLabelShowPrice] = useState(true);
  const [labelShowLogo, setLabelShowLogo] = useState(true);
  const [labelShowCategory, setLabelShowCategory] = useState(true);

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
  const [galleryImages, setGalleryImages] = useState<ProductGalleryImage[]>([]);
  const [volumePricing, setVolumePricing] = useState<Array<{ min_qty: number, price: number }>>([]);
  const [tempMinQty, setTempMinQty] = useState('');
  const [tempUnitPriceInput, setTempUnitPriceInput] = useState('');
  const [variantOptions, setVariantOptions] = useState<Array<{ name: string }>>([]);
  const [colorOptions, setColorOptions] = useState<Array<{ name: string, hex?: string }>>([]);
  const [tempVariantName, setTempVariantName] = useState('');
  const [tempColorName, setTempColorName] = useState('');
  const [tempColorHex, setTempColorHex] = useState('#111827');
  const [registrationType, setRegistrationType] = useState<ProductRegistrationType>('simple_unit');
  const [isAdvancedPricingOpen, setIsAdvancedPricingOpen] = useState(false);
  const [isConfiguratorOpen, setIsConfiguratorOpen] = useState(false);
  const [saleMode, setSaleMode] = useState<ProductSaleModeDraft>('unidade');
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
  const [variantPricingMatrix, setVariantPricingMatrix] = useState<VariantPricingMatrixRow[]>([]);
  const [matrixMaterial, setMatrixMaterial] = useState('');
  const [matrixSize, setMatrixSize] = useState('');
  const [matrixColors, setMatrixColors] = useState('');
  const [matrixFinishing, setMatrixFinishing] = useState('');
  const [matrixQuantity, setMatrixQuantity] = useState('');
  const [matrixUnitPriceInput, setMatrixUnitPriceInput] = useState('');

  const parsedTempMinQty = tempMinQty.trim()
    ? Math.max(0, parseInt(tempMinQty, 10) || 0)
    : 0;
  const parsedTempUnitPrice = parseUnitCurrencyInputToNumber(tempUnitPriceInput);
  const tempCalculatedTotal = parsedTempMinQty > 0 && parsedTempUnitPrice > 0
    ? Math.round(parsedTempMinQty * parsedTempUnitPrice * 100) / 100
    : 0;

  const handleTempMinQtyChange = (valStr: string) => {
    setTempMinQty(valStr.replace(/\D/g, ''));
  };

  const handleTempUnitPriceChange = (value: string) => {
    const cleaned = value.replace(/[^\d,.]/g, '');
    const separatorIndex = cleaned.search(/[,.]/);

    if (separatorIndex === -1) {
      setTempUnitPriceInput(cleaned);
      return;
    }

    const integerPart = cleaned.slice(0, separatorIndex).replace(/[,.]/g, '');
    const separator = cleaned[separatorIndex];
    const decimalPart = cleaned.slice(separatorIndex + 1).replace(/[,.]/g, '').slice(0, 4);
    setTempUnitPriceInput(`${integerPart}${separator}${decimalPart}`);
  };

  const parsedMatrixQuantity = matrixQuantity.trim()
    ? Math.max(0, parseInt(matrixQuantity, 10) || 0)
    : 0;
  const parsedMatrixUnitPrice = parseUnitCurrencyInputToNumber(matrixUnitPriceInput);
  const matrixCalculatedTotal = parsedMatrixQuantity > 0 && parsedMatrixUnitPrice > 0
    ? Math.round(parsedMatrixQuantity * parsedMatrixUnitPrice * 100) / 100
    : 0;

  const handleMatrixQuantityChange = (value: string) => {
    setMatrixQuantity(value.replace(/\D/g, ''));
  };

  const handleMatrixUnitPriceChange = (value: string) => {
    const cleaned = value.replace(/[^\d,.]/g, '');
    const separatorIndex = cleaned.search(/[,.]/);

    if (separatorIndex === -1) {
      setMatrixUnitPriceInput(cleaned);
      return;
    }

    const integerPart = cleaned.slice(0, separatorIndex).replace(/[,.]/g, '');
    const separator = cleaned[separatorIndex];
    const decimalPart = cleaned.slice(separatorIndex + 1).replace(/[,.]/g, '').slice(0, 4);
    setMatrixUnitPriceInput(`${integerPart}${separator}${decimalPart}`);
  };

  const addVariantMatrixTier = () => {
    const material = matrixMaterial.trim();
    const size = matrixSize.trim();
    const colors = matrixColors.trim();
    const finishing = matrixFinishing.trim();
    const quantity = parsedMatrixQuantity;
    const unitPrice = parsedMatrixUnitPrice;

    if (!material || !size || !colors || !finishing) {
      alert('Informe material, tamanho, cores e acabamento para a combinação.');
      return;
    }
    if (quantity < 1) {
      alert('A quantidade da faixa deve ser maior que zero.');
      return;
    }
    if (unitPrice <= 0) {
      alert('Informe um preço unitário maior que zero.');
      return;
    }

    const existingMatrixRow = variantPricingMatrix.find((row) => (
      row.material?.toLowerCase() === material.toLowerCase() &&
      row.size?.toLowerCase() === size.toLowerCase() &&
      row.colors?.toLowerCase() === colors.toLowerCase() &&
      row.finishing?.toLowerCase() === finishing.toLowerCase()
    ));

    if (existingMatrixRow?.tiers.some((tier) => tier.quantity === quantity)) {
      alert('Já existe uma faixa com esta quantidade para esta combinação.');
      return;
    }

    setVariantPricingMatrix((current) => {
      const existingRow = current.find((row) => (
        row.material?.toLowerCase() === material.toLowerCase() &&
        row.size?.toLowerCase() === size.toLowerCase() &&
        row.colors?.toLowerCase() === colors.toLowerCase() &&
        row.finishing?.toLowerCase() === finishing.toLowerCase()
      ));
      const tier = {
        quantity,
        unit_price: unitPrice,
        total_price: matrixCalculatedTotal
      };

      if (existingRow) {
        return current.map((row) => {
          if (row.id !== existingRow.id) return row;
          return {
            ...row,
            tiers: [...row.tiers, tier].sort((a, b) => a.quantity - b.quantity)
          };
        });
      }

      return [
        ...current,
        {
          id: `matrix-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          material,
          size,
          colors,
          finishing,
          tiers: [tier]
        }
      ];
    });
    setMatrixQuantity('');
    setMatrixUnitPriceInput('');
  };

  const removeVariantMatrixRow = (rowId: string) => {
    setVariantPricingMatrix((current) => current.filter((row) => row.id !== rowId));
  };

  const removeVariantMatrixTier = (rowId: string, quantity: number) => {
    setVariantPricingMatrix((current) => current
      .map((row) => row.id === rowId
        ? { ...row, tiers: row.tiers.filter((tier) => tier.quantity !== quantity) }
        : row)
      .filter((row) => row.tiers.length > 0)
    );
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

  const syncGallery = (images: ProductGalleryImage[]) => {
    const normalized = prepareProductGallery(images, name.trim() || 'Produto');
    setGalleryImages(normalized);
    setImageUrl(normalized.find((image) => image.is_primary)?.url || normalized[0]?.url || '');
  };

  // Image upload
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const limitValidation = validateProductGalleryLimit(galleryImages.length, files.length);
    if (!limitValidation.valid) {
      alert(limitValidation.message);
      e.target.value = '';
      return;
    }

    const invalidValidation = files.map(validateProductImage).find((validation) => !validation.valid);
    if (invalidValidation && !invalidValidation.valid) {
      alert(invalidValidation.message);
      e.target.value = '';
      return;
    }

    try {
      const uploadedImages = await Promise.all(files.map(async (file) => {
        const url = await uploadProductImage(supabase, file, {
          companyId: company?.id,
          productId: selectedProduct?.id,
          productName: name.trim() || file.name
        });

        return {
          url,
          alt: name.trim() || file.name
        };
      }));

      syncGallery([
        ...galleryImages,
        ...uploadedImages.map((image, index) => ({
          ...image,
          is_primary: galleryImages.length === 0 && index === 0
        }))
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Nao foi possivel enviar a imagem para o bucket ${PRODUCT_IMAGE_BUCKET}.`;
      alert(message);
    } finally {
      e.target.value = '';
    }
  };

  const handleSetPrimaryImage = (imageUrlToPromote: string) => {
    syncGallery(galleryImages.map((image) => ({
      ...image,
      is_primary: image.url === imageUrlToPromote
    })));
  };

  const handleRemoveGalleryImage = (imageUrlToRemove: string) => {
    syncGallery(galleryImages.filter((image) => image.url !== imageUrlToRemove));
  };

  // Volume pricing helpers
  const addVolumeTier = () => {
    const qty = parsedTempMinQty;
    const unitPrice = parsedTempUnitPrice;
    if (qty < 1) {
      alert("A quantidade minima deve ser pelo menos 1.");
      return;
    }
    if (unitPrice <= 0) {
      alert("O preço deve ser maior que zero.");
      return;
    }
    if (volumePricing.some(tier => tier.min_qty === qty)) {
      alert("Já existe uma faixa configurada para esta quantidade mínima.");
      return;
    }

    const updated = [...volumePricing, { min_qty: qty, price: unitPrice }]
      .sort((a, b) => a.min_qty - b.min_qty);
    setVolumePricing(updated);
    setTempMinQty('');
    setTempUnitPriceInput('');
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

  const getPricingTypeForSaleMode = (mode: ProductSaleModeDraft): Product['pricing_type'] => {
    return saleModeOptions.find((option) => option.value === mode)?.pricingType || 'unidade';
  };

  const getRegistrationTypeForSaleMode = (mode: ProductSaleModeDraft, product?: Product): ProductRegistrationType => {
    const configurator = product?.pricing_details?.configurator_options as { registration_type?: ProductRegistrationType } | undefined;
    const savedType = configurator?.registration_type;
    if (savedType) return savedType;
    if (mode === 'volume' || (product?.volume_pricing?.length || 0) > 0) return 'tiered';
    if (mode === 'm2' || mode === 'linear_width' || mode === 'linear' || mode === 'width_height') return 'measured';
    if (mode === 'custom') return product?.stock_controlled === false ? 'service' : 'custom_project';
    return 'simple_unit';
  };

  const handleRegistrationTypeChange = (type: ProductRegistrationType) => {
    setRegistrationType(type);
    const defaultSaleMode = registrationTypeCards.find((card) => card.value === type)?.defaultSaleMode || 'unidade';
    handleSaleModeChange(defaultSaleMode);
    if (type === 'service' || type === 'custom_project') {
      setStockControlled(false);
      setQuoteOnRequest(type === 'custom_project');
    }
    if (type === 'simple_unit') {
      setStockControlled(true);
      setQuoteOnRequest(false);
    }
    if (type === 'tiered') {
      setIsAdvancedPricingOpen(false);
      setIsConfiguratorOpen(false);
    }
  };

  const handleSaleModeChange = (mode: ProductSaleModeDraft) => {
    setSaleMode(mode);
    setPricingType(getPricingTypeForSaleMode(mode));
    setRegistrationType(getRegistrationTypeForSaleMode(mode));
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
    sale_mode: saleMode === 'linear_width' ? 'linear' : saleMode,
    registration_type: registrationType,
    allow_custom_measure: allowCustomMeasure,
    min_width: minWidth || undefined,
    min_height: minHeight || undefined,
    max_width: maxWidth || undefined,
    max_height: maxHeight || undefined,
    min_area: minArea || undefined,
    min_length: minLength || undefined,
    kit_items: kitItems.trim() || undefined,
    min_quantity: saleMode === 'volume' ? undefined : Math.max(1, configMinQuantity || 1),
    size_options: sizeOptions.filter(option => option.name.trim()),
    quote_on_request: quoteOnRequest,
    customer_message: customerMessage.trim() || undefined,
    option_groups: normalizeConfiguratorGroups(),
    variant_pricing_matrix: variantPricingMatrix
      .map((row) => ({
        ...row,
        material: row.material?.trim(),
        size: row.size?.trim(),
        colors: row.colors?.trim(),
        finishing: row.finishing?.trim(),
        tiers: row.tiers
          .filter((tier) => tier.quantity > 0 && tier.unit_price > 0)
          .map((tier) => ({
            quantity: tier.quantity,
            unit_price: tier.unit_price,
            total_price: tier.total_price || Math.round(tier.quantity * tier.unit_price * 100) / 100
          }))
          .sort((a, b) => a.quantity - b.quantity)
      }))
      .filter((row) => row.material && row.size && row.colors && row.finishing && row.tiers.length > 0)
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
    setGalleryImages([]);
    setVolumePricing([]);
    setVariantOptions([]);
    setColorOptions([]);
    setTempVariantName('');
    setTempColorName('');
    setTempColorHex('#111827');
    setRegistrationType('simple_unit');
    setIsAdvancedPricingOpen(false);
    setIsConfiguratorOpen(false);
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
    setVariantPricingMatrix([]);
    setMatrixMaterial('');
    setMatrixSize('');
    setMatrixColors('');
    setMatrixFinishing('');
    setMatrixQuantity('');
    setMatrixUnitPriceInput('');
    setTempMinQty('');
    setTempUnitPriceInput('');
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
    const productGallery = normalizeProductGallery(prod);
    setDeliveryTime(prod.delivery_time || prod.pricing_details?.delivery_time || '');
    setImageUrl(productGallery.find((image) => image.is_primary)?.url || productGallery[0]?.url || prod.image_url || '');
    setGalleryImages(productGallery);
    setVolumePricing(prod.volume_pricing || []);
    setVariantOptions(prod.variant_options || []);
    setColorOptions(prod.color_options || []);
    const configurator = prod.pricing_details?.configurator_options;
    const nextSaleMode = configurator?.sale_mode === 'unidade' && (prod.volume_pricing?.length || 0) > 0
      ? 'volume'
      : configurator?.sale_mode || ((prod.volume_pricing?.length || 0) > 0 ? 'volume' : prod.pricing_type);
    setSaleMode(nextSaleMode);
    setRegistrationType(getRegistrationTypeForSaleMode(nextSaleMode, prod));
    setIsAdvancedPricingOpen(false);
    setIsConfiguratorOpen(false);
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
    setVariantPricingMatrix(configurator?.variant_pricing_matrix || []);
    setMatrixMaterial('');
    setMatrixSize('');
    setMatrixColors('');
    setMatrixFinishing('');
    setMatrixQuantity('');
    setMatrixUnitPriceInput('');
    setTempVariantName('');
    setTempColorName('');
    setTempColorHex('#111827');
    setTempMinQty('');
    setTempUnitPriceInput('');
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
    const usesRequiredVolumePricing = saleMode === 'volume';
    const productVolumePricing = volumePricing.length > 0 ? volumePricing : undefined;
    const cleanDeliveryTime = deliveryTime.trim();

    if (usesRequiredVolumePricing && volumePricing.length === 0) {
      alert('Adicione pelo menos uma opcao de quantidade para produtos vendidos por quantidade/lote.');
      return;
    }
    const cleanDescription = sanitizeRichTextHtml(description);
    const configuratorOptions = buildConfiguratorOptions();
    const normalizedGallery = prepareProductGallery(galleryImages, name.trim() || 'Produto');
    const primaryImageUrl = normalizedGallery.find((image) => image.is_primary)?.url || normalizedGallery[0]?.url || '';
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
      configurator_options: configuratorOptions,
      gallery_images: normalizedGallery.length > 0 ? normalizedGallery : undefined
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
        image_url: primaryImageUrl || imageUrl || undefined,
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
        image_url: primaryImageUrl || imageUrl || undefined,
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

  const getProductSaleMode = (product: Product): ProductSaleModeDraft => {
    const configuredMode = product.pricing_details?.configurator_options?.sale_mode;
    if (configuredMode === 'linear' && product.pricing_details?.configurator_options?.max_width) return 'linear_width';
    if (configuredMode) return configuredMode;
    if ((product.volume_pricing?.length || 0) > 0) return 'volume';
    if (product.variant_options?.length || product.color_options?.length) return 'size_grid';
    return product.pricing_type === 'm2' ? 'm2' : product.pricing_type;
  };

  const getSaleModeLabel = (product: Product) => {
    const mode = getProductSaleMode(product);
    const labels: Record<ProductSaleModeDraft, string> = {
      unidade: 'Unidade',
      volume: 'Preço por lote',
      m2: 'M²',
      linear_width: 'Metro linear largura max.',
      linear: 'Comprimento linear',
      width_height: 'Sob medida',
      pacote: 'Pacote',
      kit: 'Kit',
      size_grid: 'Com variações',
      custom: 'Personalizado'
    };
    return labels[mode] || product.pricing_type;
  };

  const getProductPriceLabel = (product: Product) => {
    const firstVolumeTier = getNormalizedVolumePricing(product)[0];
    if (firstVolumeTier) return `A partir de ${formatCurrency(firstVolumeTier.total)}`;

    const firstMatrixTier = getNormalizedVariantPricingMatrix(product)[0]?.tiers[0];
    if (firstMatrixTier) return `A partir de ${formatCurrency(firstMatrixTier.total)}`;

    if (!product.sales_price || product.sales_price <= 0) return 'Preço não definido';
    return formatCurrency(product.sales_price);
  };

  const getProductStockInfo = (product: Product) => {
    if (!product.stock_controlled) {
      return { label: 'Sem controle', dotClass: 'bg-slate-400', textClass: 'text-muted-foreground' };
    }

    if (product.current_stock <= 0) {
      return { label: 'Sem estoque', dotClass: 'bg-rose-500', textClass: 'text-rose-600' };
    }

    if (product.current_stock < product.min_stock) {
      return { label: `Baixo: ${product.current_stock}`, dotClass: 'bg-amber-500', textClass: 'text-amber-600' };
    }

    return { label: `Em estoque: ${product.current_stock}`, dotClass: 'bg-emerald-500', textClass: 'text-emerald-600' };
  };

  const formatQuantityTier = (tier: NormalizedVolumePriceTier) => ({
    quantity: `${tier.min_qty} un`,
    unit: `${formatUnitCurrency(tier.price)}/un`,
    total: `${formatCurrency(tier.total)} total`
  });

  const getProductQuantityTiers = (product: Product) => {
    return getProductQuantityTierSummary(product);
  };

  const getProductCategoryName = (product: Product) => {
    return categories.find((category) => category.id === product.category_id)?.name || 'Outros';
  };

  const openLabelsModal = (product?: Product) => {
    setLabelProductId(product?.id || filteredProducts[0]?.id || products[0]?.id || '');
    setLabelQuantity(1);
    setIsLabelsModalOpen(true);
  };

  const selectedLabelProduct = products.find((product) => product.id === labelProductId) || filteredProducts[0] || products[0];
  const safeLabelQuantity = Math.max(1, Math.min(99, Number(labelQuantity) || 1));
  const printableLabels = selectedLabelProduct ? Array.from({ length: safeLabelQuantity }, (_, index) => index) : [];
  const labelLogoSettings = settings as typeof settings & { logo_url?: string; logo_light?: string; logo_dark?: string };
  const labelCompanyLogo = labelLogoSettings.logo_url || labelLogoSettings.logo_light || labelLogoSettings.logo_dark || null;

  const normalizedVolumePricingPreview = volumePricing
    .map((tier) => ({
      min_qty: tier.min_qty,
      price: tier.price,
      total: Math.round(tier.min_qty * tier.price * 100) / 100
    }))
    .filter((tier) => tier.min_qty > 0 && tier.price >= 0)
    .sort((a, b) => a.min_qty - b.min_qty);
  const initialVolumeTier = normalizedVolumePricingPreview[0];
  const isSimpleRegistration = registrationType === 'simple_unit';
  const isMeasuredRegistration = registrationType === 'measured';
  const isTieredRegistration = registrationType === 'tiered';
  const isServiceRegistration = registrationType === 'service';
  const isCustomProjectRegistration = registrationType === 'custom_project';
  const shouldShowSaleModelSection = !isServiceRegistration && !isCustomProjectRegistration;
  const shouldShowStockSection = isSimpleRegistration || isMeasuredRegistration || isTieredRegistration;
  const shouldShowConfiguratorSection = isConfiguratorOpen;
  const shouldShowVolumePricingSection = isTieredRegistration || saleMode === 'volume';
  const shouldShowAdvancedConfiguratorTools = isConfiguratorOpen;
  const visibleSaleModeOptions = saleModeOptions.filter((option) => {
    if (isSimpleRegistration) return ['unidade', 'pacote', 'kit'].includes(option.value);
    if (isMeasuredRegistration) return ['m2', 'linear_width', 'linear', 'width_height'].includes(option.value);
    if (isTieredRegistration) return ['volume', 'size_grid'].includes(option.value);
    return ['custom', 'unidade'].includes(option.value);
  });
  const firstMatrixPreviewRow = variantPricingMatrix.find((row) => row.tiers.length > 0);
  const firstMatrixPreviewTier = firstMatrixPreviewRow
    ? [...firstMatrixPreviewRow.tiers].sort((a, b) => a.quantity - b.quantity)[0]
    : undefined;
  const catalogPreviewTier = firstMatrixPreviewTier
    ? {
        min_qty: firstMatrixPreviewTier.quantity,
        price: firstMatrixPreviewTier.unit_price,
        total: Math.round((firstMatrixPreviewTier.total_price || firstMatrixPreviewTier.quantity * firstMatrixPreviewTier.unit_price) * 100) / 100,
        matrixLabel: [firstMatrixPreviewRow?.material, firstMatrixPreviewRow?.size, firstMatrixPreviewRow?.colors, firstMatrixPreviewRow?.finishing].filter(Boolean).join(' | ')
      }
    : initialVolumeTier;
  const selectedCategoryName = categories.find((category) => category.id === categoryId)?.name || 'Sem categoria';
  const normalizedCategoryName = selectedCategoryName.toLowerCase();
  const categoryGuidance = normalizedCategoryName.includes('serralharia')
    ? {
        title: 'Sugestão para serralharia',
        modes: 'Projeto sob medida, produto por medida ou serviço.',
        examples: 'Portão, grade, corrimão, estrutura metálica, suporte, solda e manutenção.'
      }
    : normalizedCategoryName.includes('marcenaria')
      ? {
          title: 'Sugestão para marcenaria',
          modes: 'Projeto sob medida, produto por medida ou serviço.',
          examples: 'Armário, balcão, painel, prateleira, móvel planejado, bancada, corte e montagem.'
        }
      : null;
  const registrationFlowSummary = {
    simple_unit: {
      title: 'Produto simples',
      fields: 'Dados básicos, preço final, catálogo simples e estoque opcional.',
      catalog: 'O cliente vê o preço unitário e escolhe a quantidade livremente.',
      tip: 'Ideal para itens prontos, brindes, peças unitárias e produtos de balcão.'
    },
    measured: {
      title: 'Produto por medida',
      fields: 'Dados básicos, tipo de medida, limites, preço por medida e catálogo simples.',
      catalog: 'O cliente informa medidas dentro das regras configuradas.',
      tip: 'Use metro quadrado, metro linear com largura máxima, comprimento simples ou largura x altura.'
    },
    tiered: {
      title: 'Produto por tiragem/lote',
      fields: 'Dados básicos, tabela de faixas, matriz opcional e preço por quantidade.',
      catalog: 'O cliente escolhe uma tiragem cadastrada e vê valor unitário e total do lote.',
      tip: 'Ideal para panfletos, cartões, folders, talões e impressos por quantidade.'
    },
    service: {
      title: 'Serviço',
      fields: 'Dados básicos, tipo de cobrança, valor base, prazo estimado e observações.',
      catalog: 'O cliente entende que está contratando um serviço, não um item de estoque.',
      tip: 'Use para arte final, instalação, manutenção, solda, corte, visita técnica e mão de obra.'
    },
    custom_project: {
      title: 'Projeto sob medida',
      fields: 'Segmento, tipo do projeto, medidas, material, acabamento, instalação, mão de obra e prazo.',
      catalog: 'O cliente envia a solicitação para análise comercial antes do orçamento final.',
      tip: 'Use para serralharia, marcenaria, comunicação visual e projetos com muitas variáveis.'
    }
  }[registrationType];

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

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <button
                    type="button"
                    onClick={() => openLabelsModal()}
                    disabled={products.length === 0}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4" /> Etiquetas
                  </button>
                  <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-md shadow-primary/20 transition-all shrink-0 w-full sm:w-auto justify-center"
                  >
                    <Plus className="h-4 w-4" /> Cadastrar Produto
                  </button>
                </div>
              </div>

              {/* 3. Products Card Grid */}
              <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border bg-secondary/10 flex flex-col gap-1 md:flex-row md:justify-between md:items-center">
                  <div>
                    <h3 className="font-bold text-foreground text-sm uppercase tracking-wide">Catálogo Geral de Produtos</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Visualização em cards para análise rápida do catálogo.</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-semibold whitespace-nowrap">Exibindo {filteredProducts.length} registros</span>
                </div>

                <div className="p-4">
                  {filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                      {filteredProducts.map((prod) => {
                        const catName = categories.find(c => c.id === prod.category_id)?.name || 'Outros';
                        const stockInfo = getProductStockInfo(prod);
                        const priceLabel = getProductPriceLabel(prod);
                        const hasVolumePricing = (prod.volume_pricing?.length || 0) > 0;
                        const hasVariants = Boolean(prod.variant_options?.length || prod.color_options?.length || prod.pricing_details?.configurator_options?.variant_pricing_matrix?.length);
                        const quantityTierSummary = getProductQuantityTiers(prod);
                        const cardTiers = quantityTierSummary.tiers.slice(0, 3);
                        const hiddenTierCount = quantityTierSummary.tiers.length - cardTiers.length;
                        const productGallery = normalizeProductGallery(prod);
                        const primaryImage = getPrimaryProductImage(prod);

                        return (
                          <article key={prod.id} className="group flex min-h-[318px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
                            <div className="relative aspect-[1.28] overflow-hidden bg-secondary/30 border-b border-border">
                              {primaryImage ? (
                                <img
                                  src={primaryImage}
                                  alt={prod.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package className="h-8 w-8" />
                                </div>
                              )}

                              {productGallery.length > 1 && (
                                <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-black text-slate-700 shadow-sm">
                                  +{productGallery.length - 1} imagens
                                </span>
                              )}

                              <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border shadow-sm ${
                                  prod.catalog_active !== false
                                    ? 'bg-emerald-500/95 text-white border-emerald-500'
                                    : 'bg-slate-900/80 text-white border-slate-700'
                                }`}>
                                  {prod.catalog_active !== false ? 'Catálogo' : 'Oculto'}
                                </span>
                                {prod.is_highlight && (
                                  <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black shadow-sm">
                                    Destaque
                                  </span>
                                )}
                                {prod.is_promo && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black shadow-sm">
                                    Promoção
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-1 flex-col p-3">
                              <div className="space-y-2">
                                <div className="min-w-0">
                                  <h4
                                    className="min-h-[34px] text-[13px] font-black leading-snug text-foreground"
                                    title={prod.name}
                                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                  >
                                    {prod.name}
                                  </h4>
                                  <p className={`mt-1 text-base font-black ${prod.sales_price > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {priceLabel}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  <span className="max-w-full truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary" title={catName}>
                                    {catName}
                                  </span>
                                  <span className="rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                                    {getSaleModeLabel(prod)}
                                  </span>
                                  {hasVolumePricing && (
                                    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">
                                      Lote
                                    </span>
                                  )}
                                  {hasVariants && (
                                    <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold text-violet-600">
                                      Variações
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                                  <span className={`h-2 w-2 rounded-full ${stockInfo.dotClass}`} />
                                  <span className={stockInfo.textClass}>{stockInfo.label}</span>
                                </div>

                                {cardTiers.length > 0 && (
                                  <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <span className="text-[9px] font-black uppercase tracking-wide text-emerald-700">Faixas de quantidade</span>
                                      {hiddenTierCount > 0 && (
                                        <span className="text-[9px] font-bold text-emerald-700">+ {hiddenTierCount} faixas</span>
                                      )}
                                    </div>
                                    <div className="space-y-0.5">
                                      {cardTiers.map((tier) => {
                                        const formattedTier = formatQuantityTier(tier);
                                        return (
                                          <div key={`${prod.id}-${tier.min_qty}-${tier.price}`} className="grid grid-cols-[42px_1fr_1fr] gap-1 text-[9px] font-bold leading-tight">
                                            <span className="text-foreground">{formattedTier.quantity}</span>
                                            <span className="text-muted-foreground">{formattedTier.unit}</span>
                                            <span className="text-right text-muted-foreground">{formattedTier.total.replace(' total', '')}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {cardTiers.length === 0 && getProductSaleMode(prod) === 'volume' && (
                                  <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-2 py-1.5 text-[9px] font-bold text-amber-700">
                                    Sem faixas cadastradas
                                  </div>
                                )}
                              </div>

                              <div className="mt-3 rounded-lg border border-border bg-secondary/15 px-2 py-1.5">
                                <span className="inline-flex max-w-full rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
                                  SKU: {prod.sku}
                                </span>
                                <ProductBarcode
                                  value={prod.sku}
                                  fallback={prod.id}
                                  height={24}
                                  showText={false}
                                  className="mt-1.5 h-7 w-full rounded border border-slate-200 bg-white"
                                />
                                <p className="mt-0.5 truncate text-center font-mono text-[8px] tracking-tight text-muted-foreground">{prod.sku || prod.id}</p>
                              </div>

                              <div className="mt-auto flex items-center gap-1.5 pt-3 border-t border-border/70">
                                <button
                                  onClick={() => handleOpenEdit(prod)}
                                  className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/10 bg-primary/10 px-2 text-[11px] font-bold text-primary hover:bg-primary/15"
                                  title="Editar Produto"
                                  aria-label={`Editar ${prod.name}`}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Editar
                                </button>
                                  <button
                                    onClick={() => handleDuplicateProduct(prod)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title="Duplicar Produto"
                                    aria-label={`Duplicar ${prod.name}`}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Excluir o produto "${prod.name}" do catálogo do ERP?`)) {
                                        deleteProduct(prod.id);
                                      }
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                                    title="Excluir Produto"
                                    aria-label={`Excluir ${prod.name}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-10 text-center text-muted-foreground italic text-xs">
                      Nenhum produto encontrado.
                    </div>
                  )}
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

          {isLabelsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 product-label-modal-shell">
              <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
                <div className="no-print flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-foreground">Etiquetas de produtos</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Pré-visualize e imprima etiquetas com código de barras Code 128.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLabelsModalOpen(false)}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Fechar etiquetas"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[320px_1fr]">
                  <div className="no-print space-y-4 border-b border-border p-5 lg:border-b-0 lg:border-r">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground">Produto</label>
                      <select
                        value={labelProductId}
                        onChange={(event) => setLabelProductId(event.target.value)}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground"
                      >
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Quantidade</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={labelQuantity}
                          onChange={(event) => setLabelQuantity(Math.max(1, Number(event.target.value) || 1))}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-muted-foreground">Tamanho</label>
                        <select
                          value={labelSize}
                          onChange={(event) => setLabelSize(event.target.value as ProductLabelSize)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground"
                        >
                          {Object.entries(productLabelSizes).map(([key, size]) => (
                            <option key={key} value={key}>
                              {size.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
                      {[
                        { label: 'Mostrar preço', checked: labelShowPrice, onChange: setLabelShowPrice },
                        { label: 'Mostrar logo', checked: labelShowLogo, onChange: setLabelShowLogo },
                        { label: 'Mostrar categoria', checked: labelShowCategory, onChange: setLabelShowCategory }
                      ].map((option) => (
                        <label key={option.label} className="flex items-center justify-between gap-3 text-xs font-semibold text-foreground">
                          <span>{option.label}</span>
                          <input
                            type="checkbox"
                            checked={option.checked}
                            onChange={(event) => option.onChange(event.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      disabled={!selectedLabelProduct}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir etiquetas
                    </button>
                  </div>

                  <div className="bg-secondary/20 p-5">
                    <div className="no-print mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-foreground">Prévia</p>
                        <p className="text-[11px] text-muted-foreground">A impressão usa somente a grade de etiquetas abaixo.</p>
                      </div>
                      <span className="rounded-full border border-border bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground">
                        {safeLabelQuantity} etiqueta(s)
                      </span>
                    </div>

                    <div className="product-label-print-area flex flex-wrap content-start gap-3 rounded-xl border border-dashed border-border bg-white p-4">
                      {selectedLabelProduct ? (
                        printableLabels.map((index) => (
                          <ProductLabelPreview
                            key={`${selectedLabelProduct.id}-${index}`}
                            product={selectedLabelProduct}
                            categoryName={getProductCategoryName(selectedLabelProduct)}
                            saleModeLabel={getSaleModeLabel(selectedLabelProduct)}
                            companyLogoUrl={labelCompanyLogo}
                            size={labelSize}
                            showPrice={labelShowPrice}
                            showLogo={labelShowLogo}
                            showCategory={labelShowCategory}
                            formatCurrency={formatCurrency}
                          />
                        ))
                      ) : (
                        <div className="w-full py-10 text-center text-xs text-muted-foreground">Nenhum produto disponível para etiquetas.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden !important;
              }

              .product-label-print-area,
              .product-label-print-area * {
                visibility: visible !important;
              }

              .product-label-print-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                min-height: auto !important;
                display: flex !important;
                flex-wrap: wrap !important;
                align-content: flex-start !important;
                gap: 3mm !important;
                padding: 0 !important;
                border: 0 !important;
                background: #ffffff !important;
              }

              .product-label-preview {
                box-shadow: none !important;
                page-break-inside: avoid !important;
              }

              @page {
                margin: 8mm;
              }
            }
          `}</style>
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
              <section className="order-0 rounded-2xl border border-primary/15 bg-primary/5 p-4 shadow-sm space-y-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Assistente de cadastro</span>
                  <h4 className="mt-1 text-base font-black text-foreground">Que tipo de item você quer cadastrar?</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Escolha uma opção para mostrar apenas os campos necessários.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {registrationTypeCards.map((card) => {
                    const selected = registrationType === card.value;
                    return (
                      <button
                        key={card.value}
                        type="button"
                        onClick={() => handleRegistrationTypeChange(card.value)}
                        className={`min-h-[132px] rounded-xl border p-3 text-left transition-all ${
                          selected
                            ? 'border-primary bg-white text-foreground shadow-sm ring-2 ring-primary/10'
                            : 'border-border bg-white/70 text-muted-foreground hover:border-primary/40 hover:bg-white'
                        }`}
                      >
                        <span className="block text-xs font-black text-foreground">{card.title}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed">{card.description}</span>
                        <span className="mt-2 block text-[10px] font-semibold leading-relaxed text-primary">{card.examples}</span>
                      </button>
                    );
                  })}
                </div>
                {categoryGuidance && (
                  <div className="rounded-xl border border-primary/15 bg-white px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="block text-xs font-black text-foreground">{categoryGuidance.title}</span>
                    <span className="mt-0.5 block font-semibold text-primary">{categoryGuidance.modes}</span>
                    <span className="mt-0.5 block">{categoryGuidance.examples}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-white p-3 text-[11px] leading-relaxed md:grid-cols-3">
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wide text-primary">Caminho selecionado</span>
                    <span className="mt-1 block text-sm font-black text-foreground">{registrationFlowSummary.title}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Campos principais</span>
                    <span className="mt-1 block text-muted-foreground">{registrationFlowSummary.fields}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Como aparece no catálogo</span>
                    <span className="mt-1 block text-muted-foreground">{registrationFlowSummary.catalog}</span>
                  </div>
                  <div className="rounded-lg border border-primary/10 bg-primary/5 px-3 py-2 font-semibold text-primary md:col-span-3">
                    {registrationFlowSummary.tip}
                  </div>
                </div>
              </section>

              <section className="order-1 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <summary className="cursor-pointer list-none border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">1. Informações do Produto</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Dados principais usados no cadastro interno, identificação e organização do produto.
                  </p>
                </summary>

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
              {shouldShowSaleModelSection && (
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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {visibleSaleModeOptions.map((option) => {
                        const selected = saleMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleSaleModeChange(option.value)}
                            className={`min-h-[74px] rounded-xl border px-3 py-2 text-left text-[11px] transition-all ${
                              selected
                                ? 'border-primary bg-primary/5 text-foreground shadow-sm ring-2 ring-primary/10'
                                : 'border-border bg-white text-muted-foreground hover:border-primary/40'
                            }`}
                          >
                            <span className="block text-xs font-black text-foreground">{saleModeOperatorGuidance[option.value].title}</span>
                            <span className="mt-1 block leading-relaxed">{saleModeOperatorGuidance[option.value].impact}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed">
                      <span className="block text-xs font-black text-foreground">
                        {saleModeOperatorGuidance[saleMode].title}
                      </span>
                      <span className="mt-1 block text-muted-foreground">
                        {saleModeOperatorGuidance[saleMode].impact}
                      </span>
                      <span className="mt-1 block font-semibold text-primary">
                        {saleModeOperatorGuidance[saleMode].catalog}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-secondary/10 p-3 space-y-3">
                    {saleMode === 'unidade' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                        <div className="rounded-lg bg-white border border-border p-3">
                          <span className="font-bold text-foreground block">Preco unitario direto</span>
                          <span className="text-muted-foreground">O cliente ve o preco final de venda e escolhe a quantidade livremente.</span>
                        </div>
                        <div className="rounded-lg bg-white border border-border p-3">
                          <span className="font-bold text-foreground block">Sem tabela de lote</span>
                          <span className="text-muted-foreground">Para tiragem fixa ou atacado, troque para Preco por Quantidade / Lote.</span>
                        </div>
                      </div>
                    )}

                    {saleMode === 'volume' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="rounded-lg bg-white border border-emerald-500/20 p-3">
                          <span className="font-bold text-foreground block">Tabela de tiragens obrigatoria</span>
                          <span className="text-muted-foreground">Cadastre pelo menos uma faixa com quantidade, preco unitario e total do lote.</span>
                        </div>
                        <div className="rounded-lg bg-white border border-primary/20 p-3">
                          <span className="font-bold text-foreground block">Como o cliente vai ver</span>
                          <span className="text-muted-foreground">
                            {initialVolumeTier
                              ? `A partir de ${initialVolumeTier.min_qty} un - ${formatUnitCurrency(initialVolumeTier.price)} /un - ${formatCurrency(initialVolumeTier.price * initialVolumeTier.min_qty)} total`
                              : 'Adicione uma faixa para exibir A partir de, valor por unidade e total do lote.'}
                          </span>
                        </div>
                      </div>
                    )}

                    {(saleMode === 'm2' || saleMode === 'width_height') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <p className="sm:col-span-2 lg:col-span-3 rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                          O cliente informa largura e altura no catalogo. O preco final usa area em m2 e respeita a area minima, quando configurada.
                        </p>
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

                    {saleMode === 'linear_width' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <p className="sm:col-span-2 lg:col-span-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                          O cálculo usa largura informada x altura/comprimento x valor do metro linear. Largura máxima limita o material; não é metragem mínima.
                        </p>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Largura máxima do material (cm)</label>
                          <input type="number" min="0" value={maxWidth} onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value) || 0))} placeholder="Ex: 120" className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Largura mínima opcional (cm)</label>
                          <input type="number" min="0" value={minWidth} onChange={(e) => setMinWidth(Math.max(0, Number(e.target.value) || 0))} placeholder="Ex: 30" className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">Cobrança mínima opcional (m²)</label>
                          <input type="number" min="0" step="0.01" value={minArea} onChange={(e) => setMinArea(Math.max(0, Number(e.target.value) || 0))} placeholder="Ex: 1" className="w-full px-3 py-2 bg-white border border-border rounded-lg text-xs text-foreground" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-emerald-500/20 bg-white p-3 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="block text-xs font-black text-foreground">Resumo visual da regra</span>
                          <span className="mt-1 block">Campos no atendimento: largura solicitada, altura/comprimento, valor do metro linear e quantidade.</span>
                          <span className="mt-1 block font-semibold text-emerald-700">Exemplo: 0,80 m x 3,00 m x R$ 50,00 = R$ 120,00.</span>
                          <span className="mt-1 block">Se a largura solicitada ultrapassar a largura máxima configurada, o catálogo deve bloquear a compra.</span>
                        </div>
                        <label className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 text-[11px] font-bold text-foreground">
                          <input type="checkbox" checked={allowCustomMeasure} onChange={(e) => setAllowCustomMeasure(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
                          Permitir largura e comprimento personalizados no catalogo
                        </label>
                      </div>
                    )}

                    {saleMode === 'linear' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <p className="sm:col-span-2 rounded-lg border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                          O cliente informa apenas o comprimento no catalogo. Use este modelo para perfil, tubo, regua ou produto vendido por comprimento simples.
                        </p>
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
              )}

              {isServiceRegistration && (
                <section className="order-2 rounded-2xl border border-primary/15 bg-white p-4 shadow-sm space-y-4">
                  <div className="border-b border-border/60 pb-3">
                    <span className="text-xs font-black uppercase tracking-wide text-primary">2. Serviço</span>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Use este caminho para mão de obra, instalação, manutenção, arte, corte ou atendimento sem estoque físico.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border bg-secondary/10 p-3">
                      <span className="block text-[10px] font-black uppercase text-muted-foreground">Tipo de cobrança</span>
                      <span className="mt-1 block text-xs font-bold text-foreground">Valor base ou sob consulta</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">O preço final continua no bloco de precificação.</span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Prazo estimado</label>
                      <input
                        type="text"
                        value={deliveryTime}
                        onChange={(e) => setDeliveryTime(e.target.value)}
                        placeholder="Ex: 2 dias úteis, visita agendada"
                        className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Orientação ao cliente</label>
                      <input
                        type="text"
                        value={customerMessage}
                        onChange={(e) => setCustomerMessage(e.target.value)}
                        placeholder="Ex: Informe local, medidas ou arquivo"
                        className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground"
                      />
                    </div>
                  </div>
                </section>
              )}

              {isCustomProjectRegistration && (
                <section className="order-2 rounded-2xl border border-primary/15 bg-white p-4 shadow-sm space-y-4">
                  <div className="border-b border-border/60 pb-3">
                    <span className="text-xs font-black uppercase tracking-wide text-primary">2. Projeto sob medida</span>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Use para serralharia, marcenaria, comunicação visual e projetos que dependem de análise comercial antes do preço final.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border bg-secondary/10 p-3">
                      <span className="block text-[10px] font-black uppercase text-muted-foreground">Segmento</span>
                      <span className="mt-1 block text-xs font-bold text-foreground">{selectedCategoryName}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">A categoria ajuda a orientar materiais, acabamento e mão de obra.</span>
                    </div>
                    <div className="rounded-xl border border-border bg-secondary/10 p-3">
                      <span className="block text-[10px] font-black uppercase text-muted-foreground">Campos do briefing</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">Medidas, material, acabamento, instalação, mão de obra e prazo devem entrar na descrição completa.</span>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground">Mensagem para o cliente</label>
                      <textarea
                        value={customerMessage}
                        onChange={(e) => setCustomerMessage(e.target.value)}
                        placeholder="Ex: Envie medidas, local de instalação, referência visual e prazo desejado."
                        className="min-h-[86px] w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground"
                      />
                    </div>
                  </div>
                </section>
              )}

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
              <div className="md:col-span-2 rounded-xl border border-primary/15 bg-secondary/10 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-background flex items-center justify-center">
                    {imageUrl ? (
                      <img src={imageUrl} alt="Previa do produto" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-black uppercase tracking-wide text-primary">Previa no catalogo</span>
                      {isPromo && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-600">Promocao</span>}
                      {isHighlight && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-blue-600">Destaque</span>}
                      {!catalogActive && <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-black uppercase text-muted-foreground">Fora do catalogo</span>}
                    </div>
                    <h4 className="truncate text-sm font-black uppercase tracking-wide text-foreground">
                      {name.trim() || 'Nome do produto'}
                    </h4>
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      {selectedCategoryName}{deliveryTime.trim() ? ` | Prazo: ${deliveryTime.trim()}` : ''}
                    </p>
                    <p className="text-xs font-black text-primary">
                      {catalogPreviewTier
                        ? `A partir de ${catalogPreviewTier.min_qty} un — ${formatUnitCurrency(catalogPreviewTier.price)}/un — ${formatCurrency(catalogPreviewTier.total)} total`
                        : `${formatCurrency(salesPrice)} /${pricingType}`}
                    </p>
                    {firstMatrixPreviewRow && catalogPreviewTier && (
                      <p className="text-[10px] font-semibold text-muted-foreground">
                        Matriz: {[firstMatrixPreviewRow.material, firstMatrixPreviewRow.size, firstMatrixPreviewRow.colors, firstMatrixPreviewRow.finishing].filter(Boolean).join(' | ')}
                      </p>
                    )}
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Esta previa usa a mesma regra de exibicao do card publico da loja.
                    </p>
                  </div>
                </div>
              </div>
                </div>
              </section>

              <details className="order-6 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <summary className="cursor-pointer list-none border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">6. Imagem e descrição completa</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Opcional: imagem, prévia visual e detalhes completos para produção e apresentação.
                  </p>
                </summary>

              {/* Product Image Attachment */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground block">Imagens do Produto</label>
                <div className="flex flex-col gap-3 mt-1.5">
                  <div className="flex flex-wrap items-center gap-3">
                    {galleryImages.length > 0 ? (
                      galleryImages.map((image, index) => (
                        <div
                          key={`${image.url}-${index}`}
                          className={`relative h-20 w-20 rounded-xl border overflow-hidden bg-background shrink-0 ${
                            image.is_primary ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                          }`}
                        >
                          <img src={image.url} alt={image.alt || `Imagem ${index + 1}`} className="h-full w-full object-cover" />
                          {image.is_primary && (
                            <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[8px] font-black uppercase text-primary-foreground">
                              Capa
                            </span>
                          )}
                          <div className="absolute right-1 top-1 flex gap-1">
                            {!image.is_primary && (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryImage(image.url)}
                                className="rounded bg-white/90 p-1 text-primary shadow-sm hover:bg-white"
                                title="Definir como capa"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryImage(image.url)}
                              className="rounded bg-rose-600 p-1 text-white shadow-sm hover:bg-rose-500"
                              title="Remover imagem"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground shrink-0 bg-secondary/20">
                        <Package className="h-6 w-6 stroke-[1.5]" />
                      </div>
                    )}

                    <div className="space-y-1">
                      <input
                        type="file"
                        id="product-image-upload"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        onChange={handleImageChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="product-image-upload"
                        className="px-3 py-1.5 bg-secondary border border-border hover:bg-secondary/80 text-foreground font-bold rounded-lg text-xs cursor-pointer inline-block transition-all"
                      >
                        Escolher imagens
                      </label>
                      <span className="text-[9px] text-muted-foreground block">PNG, JPG ou WEBP de até 2MB cada. Máximo de {MAX_PRODUCT_GALLERY_IMAGES} imagens; a capa aparece no card do catálogo.</span>
                    </div>
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
              </details>

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
              <details
                className="md:col-span-2 bg-secondary/15 p-4 rounded-xl border border-border space-y-3.5"
                open={isAdvancedPricingOpen}
                onToggle={(event) => setIsAdvancedPricingOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer list-none">
                  <span className="font-bold text-xs text-foreground block uppercase tracking-wide">
                    Precificação avançada opcional
                </span>
                  <span className="mt-1 block text-[10px] font-medium text-muted-foreground">
                    Use apenas se quiser calcular margem, comissão e impostos. O modo simples usa custo e preço de venda.
                  </span>
                </summary>
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
              </details>

              {/* Volume pricing tiers */}
              {shouldShowVolumePricingSection && (
              <div className="md:col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-3">
                <div>
                  <span className="font-bold text-xs text-foreground block">Preço por Quantidade (Tabela de Volume / Atacado)</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">
                    Neste modelo, a quantidade e definida nas faixas de preco abaixo. O cliente escolhera uma das tiragens cadastradas no catalogo.
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-secondary/15 p-3 rounded-xl border border-border">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Quantidade</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tempMinQty}
                      onChange={(e) => handleTempMinQtyChange(e.target.value)}
                      placeholder="Ex: 1000"
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground text-center font-bold"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Preço Unitário (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={tempUnitPriceInput}
                      onChange={(e) => handleTempUnitPriceChange(e.target.value)}
                      placeholder="Ex: 0,1053"
                      className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase">Total do Lote (R$)</label>
                    <div className="flex h-8 w-full items-center rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground">
                      {tempCalculatedTotal > 0 ? (
                        formatCurrency(tempCalculatedTotal)
                      ) : (
                        <span className="font-medium text-muted-foreground">Calculado automaticamente</span>
                      )}
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={addVolumeTier}
                    className="py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg transition-all h-8 flex items-center justify-center w-full"
                  >
                    + Adicionar
                  </button>
                </div>

                {normalizedVolumePricingPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                        {normalizedVolumePricingPreview.length} faixa(s) cadastrada(s)
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        Quantidade · unitário · total
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {normalizedVolumePricingPreview.map((tier) => {
                        const formattedTier = formatQuantityTier(tier);
                        return (
                          <div key={tier.min_qty} className="rounded-xl border border-emerald-500/20 bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="block text-xs font-black text-foreground">A partir de {formattedTier.quantity}</span>
                                <span className="mt-1 block text-[11px] font-bold text-primary">{formattedTier.unit}</span>
                                <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">{formattedTier.total}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeVolumeTier(tier.min_qty)}
                                className="shrink-0 rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-500 hover:bg-rose-500/20"
                                title="Excluir Faixa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              )}

              {shouldShowVolumePricingSection && (
                <div className="md:col-span-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 space-y-3">
                  <div>
                    <span className="font-bold text-xs text-foreground block">Matriz de Preços por Configuração</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5 block">
                      Use quando material, tamanho, cores ou acabamento mudam o preço final. A tabela global acima continua como fallback para produtos simples.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-background/80 p-3 rounded-xl border border-border">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Material</label>
                      <input
                        type="text"
                        value={matrixMaterial}
                        onChange={(e) => setMatrixMaterial(e.target.value)}
                        placeholder="Ex: Couchê Brilho 90g"
                        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Tamanho</label>
                      <input
                        type="text"
                        value={matrixSize}
                        onChange={(e) => setMatrixSize(e.target.value)}
                        placeholder="Ex: 10x14cm"
                        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Cores</label>
                      <input
                        type="text"
                        value={matrixColors}
                        onChange={(e) => setMatrixColors(e.target.value)}
                        placeholder="Ex: 4x0 ou 4x4"
                        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Acabamento</label>
                      <input
                        type="text"
                        value={matrixFinishing}
                        onChange={(e) => setMatrixFinishing(e.target.value)}
                        placeholder="Ex: Refile"
                        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-secondary/15 p-3 rounded-xl border border-border">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Quantidade</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={matrixQuantity}
                        onChange={(e) => handleMatrixQuantityChange(e.target.value)}
                        placeholder="Ex: 1000"
                        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground text-center font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Preço Unitário (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={matrixUnitPriceInput}
                        onChange={(e) => handleMatrixUnitPriceChange(e.target.value)}
                        placeholder="Ex: 0,1053"
                        className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase">Total do Lote (R$)</label>
                      <div className="flex h-8 w-full items-center rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground">
                        {matrixCalculatedTotal > 0 ? (
                          formatCurrency(matrixCalculatedTotal)
                        ) : (
                          <span className="font-medium text-muted-foreground">Calculado automaticamente</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addVariantMatrixTier}
                      className="py-2 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg transition-all h-8 flex items-center justify-center w-full"
                    >
                      + Adicionar faixa
                    </button>
                  </div>

                  {variantPricingMatrix.length > 0 && (
                    <div className="space-y-2">
                      {variantPricingMatrix.map((row) => (
                        <div key={row.id} className="rounded-xl border border-border bg-white p-3 text-[11px]">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-black text-foreground">
                                {row.material} | {row.size} | {row.colors} | {row.finishing}
                              </p>
                              <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                                Esta combinação aparecerá no catálogo com as faixas abaixo.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeVariantMatrixRow(row.id)}
                              className="self-start rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-500"
                            >
                              Remover combinação
                            </button>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {row.tiers.map((tier) => (
                              <div key={tier.quantity} className="flex items-start justify-between gap-2 rounded-lg border border-sky-500/15 bg-sky-500/5 px-3 py-2">
                                <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                                  <div>
                                    <span className="block text-[9px] font-bold uppercase text-muted-foreground">Tiragem</span>
                                    <span className="block font-black text-foreground">{tier.quantity} un</span>
                                  </div>
                                  <div>
                                    <span className="block text-[9px] font-bold uppercase text-muted-foreground">Unitário</span>
                                    <span className="block font-black text-primary">{formatUnitCurrency(tier.unit_price)}/un</span>
                                  </div>
                                  <div>
                                    <span className="block text-[9px] font-bold uppercase text-muted-foreground">Total</span>
                                    <span className="block font-black text-foreground">{formatCurrency(tier.total_price || tier.quantity * tier.unit_price)}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeVariantMatrixTier(row.id, tier.quantity)}
                                  className="rounded bg-rose-500/10 p-1 text-rose-500"
                                  title="Excluir faixa"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
                </div>
              </section>

              {(isMeasuredRegistration || isTieredRegistration || saleMode === 'size_grid') && !shouldShowConfiguratorSection && (
                <button
                  type="button"
                  onClick={() => setIsConfiguratorOpen(true)}
                  className="order-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 text-left text-xs font-bold text-primary hover:bg-primary/10"
                >
                  + Abrir opções avançadas, variações e grupos de escolha
                </button>
              )}

              {shouldShowConfiguratorSection && (
              <section className="order-3 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">3. Configurador do Produto</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Variações, cores e grupos de opções usados para montar o produto no catálogo online.
                  </p>
                </div>

                <div key={saleMode} className="rounded-xl border border-primary/15 bg-primary/5 p-3 space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wide text-primary">
                      Campos exibidos para {saleModeOptions.find((option) => option.value === saleMode)?.label}
                    </span>
                    <span className="text-[11px] leading-relaxed text-muted-foreground">
                      {saleModeDescriptions[saleMode]}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {configuratorInterfaceFields[saleMode].map((field) => {
                      if (field.kind === 'toggle') {
                        return (
                          <label
                            key={field.label}
                            className="flex min-h-[42px] items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold text-foreground"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            {field.label}
                          </label>
                        );
                      }

                      if (field.kind === 'chip') {
                        return (
                          <button
                            key={field.label}
                            type="button"
                            className="min-h-[42px] rounded-lg border border-border bg-white px-3 py-2 text-xs font-black text-foreground hover:border-primary/40 hover:text-primary"
                          >
                            {field.label}
                          </button>
                        );
                      }

                      return (
                        <div key={field.label} className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {field.label}
                          </label>
                          <input
                            type="text"
                            placeholder={field.placeholder}
                            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground outline-none focus:border-primary/50"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

              {shouldShowAdvancedConfiguratorTools && (
              <>
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
              </>
              )}
              </section>
              )}

              {/* Stock control configurations */}
              {shouldShowStockSection && (
              <details className="order-7 rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                <summary className="cursor-pointer list-none border-b border-border/60 pb-3">
                  <span className="text-xs font-black uppercase tracking-wide text-primary">7. Estoque</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Controle de estoque, alerta mínimo e lançamento inicial quando aplicável.
                  </p>
                </summary>

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
              </details>
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
