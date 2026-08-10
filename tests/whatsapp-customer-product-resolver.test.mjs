import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in requireMap) return requireMap[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

const contract = await compile('../src/lib/whatsapp/variable-contract.ts');
const engine = await compile('../src/lib/whatsapp/template-engine.ts', { './variable-contract': contract });
const pricing = await compile('../src/lib/pricing.ts');
const richText = await import('../src/lib/rich-text-editor-core.mjs');
const resolver = await compile('../src/lib/whatsapp/customer-product-variable-resolver.server.ts', {
  './variable-contract': contract,
  './template-engine': engine,
  '@/lib/pricing': pricing,
  '@/lib/utils': { richTextToPlainText: richText.richTextToPlainText },
  '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => { throw new Error('not used'); } }
});

const customerA = {
  id: 'customer-a', company_id: 'company-a', name: 'Cliente A', phone: '1133334444', email: 'cliente@example.com',
  corporate_additional_info: { nome_fantasia: 'Fantasia A', whatsapp: '11999998888', document: 'must-not-leak' },
  document: 'must-not-leak', credit_limit: 9999, notes: 'must-not-leak'
};
const productA = {
  id: 'product-a', company_id: 'company-a', category_id: 'category-a', name: 'Produto A', description: 'Descrição pública',
  pricing_type: 'unidade', sales_price: 10, active: true, catalog_active: true, pricing_details: {}, image_url: 'https://cdn.example.com/a.png',
  volume_pricing: [], base_cost: 1, margin: 90, internal_notes: 'must-not-leak'
};
const categoryA = { id: 'category-a', company_id: 'company-a', name: 'Categoria A' };

function dataSource({ customer = customerA, product = productA, category = categoryA } = {}) {
  const counts = { customer: 0, product: 0, category: 0 };
  return { counts, source: {
    async getCustomer() { counts.customer += 1; return customer; },
    async getProduct() { counts.product += 1; return product; },
    async getCategory() { counts.category += 1; return category; }
  } };
}

const customerContext = (overrides = {}) => ({ trustedCompanyId: 'company-a', customerId: 'customer-a', eventKey: 'quote_proposal', ...overrides });
const productContext = (overrides = {}) => ({ trustedCompanyId: 'company-a', productId: 'product-a', eventKey: 'store_product_request', requireCatalogAvailability: true, pricingConfig: { quantity: 2 }, ...overrides });

test('customer loader resolves safe fields, WhatsApp and explicit legacy aliases', async () => {
  const mock = dataSource();
  const result = await resolver.resolveWhatsAppCustomerVariables(customerContext(), mock.source);
  assert.equal(result.variables['cliente.nome'], 'Cliente A');
  assert.equal(result.variables.cliente_nome, 'Cliente A');
  assert.equal(result.variables['cliente.nome_fantasia'], 'Fantasia A');
  assert.equal(result.variables['cliente.whatsapp'], '5511999998888');
  assert.equal(result.variables.cliente_telefone, '5511999998888');
  assert.equal(result.variables['cliente.email'], 'cliente@example.com');
  assert.equal(result.metadataSanitized.whatsappSource, 'customers.corporate_additional_info.whatsapp');
  assert.deepEqual(result.metadataSanitized.queryCounts, { customer: 1 });
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|credit_limit|document|customer-a|company-a/);
});

test('customer loader falls back to phone, reports missing and blocks cross-tenant data', async () => {
  const fallback = dataSource({ customer: { ...customerA, corporate_additional_info: {}, phone: '1133334444' } });
  const fallbackResult = await resolver.resolveWhatsAppCustomerVariables(customerContext(), fallback.source);
  assert.equal(fallbackResult.variables['cliente.whatsapp'], '551133334444');
  assert.equal(fallbackResult.metadataSanitized.whatsappSource, 'customers.phone');

  const missing = dataSource({ customer: { ...customerA, corporate_additional_info: {}, phone: '' } });
  const missingResult = await resolver.resolveWhatsAppCustomerVariables(customerContext(), missing.source);
  assert.equal('cliente.whatsapp' in missingResult.variables, false);
  assert.equal(missingResult.missing.includes('cliente.whatsapp'), true);
  assert.equal(missingResult.metadataSanitized.whatsappSource, 'missing');

  await assert.rejects(resolver.resolveWhatsAppCustomerVariables(customerContext(), dataSource({ customer: null }).source), /CUSTOMER_NOT_FOUND/);
  await assert.rejects(resolver.resolveWhatsAppCustomerVariables(customerContext(), dataSource({ customer: { ...customerA, company_id: 'company-b' } }).source), /TENANT_MISMATCH/);
  await assert.rejects(resolver.resolveWhatsAppCustomerVariables(customerContext(), dataSource({ customer: { ...customerA, id: 'customer-b' } }).source), /TENANT_MISMATCH/);
  await assert.rejects(resolver.resolveWhatsAppCustomerVariables(customerContext(), dataSource({ customer: { ...customerA, name: ' ' } }).source), /CUSTOMER_NAME_MISSING/);
});

test('customer corporate JSON parser rejects invalid shapes and always uses the safe phone fallback', async () => {
  const invalidValues = [
    null,
    'not-an-object',
    123,
    true,
    ['11999998888'],
    { whatsapp: 11999998888 },
    { whatsapp: { value: '11999998888' } },
    { whatsapp: [] },
    { whatsapp: '' },
    { whatsapp: '   ' }
  ];

  for (const corporateAdditionalInfo of invalidValues) {
    const customer = { ...customerA, corporate_additional_info: corporateAdditionalInfo, phone: '1133334444' };
    const result = await resolver.resolveWhatsAppCustomerVariables(customerContext({ existingCustomer: customer }), dataSource().source);
    assert.equal(result.variables['cliente.whatsapp'], '551133334444');
    assert.equal(result.metadataSanitized.whatsappSource, 'customers.phone');
    assert.doesNotMatch(JSON.stringify(result), /not-an-object|11999998888|\"value\"/);
  }

  const valid = await resolver.resolveWhatsAppCustomerVariables(customerContext({
    existingCustomer: { ...customerA, corporate_additional_info: { whatsapp: '11999998888' }, phone: '1133334444' }
  }), dataSource().source);
  assert.equal(valid.variables['cliente.whatsapp'], '5511999998888');
  assert.equal(valid.metadataSanitized.whatsappSource, 'customers.corporate_additional_info.whatsapp');
});

test('preloaded customer performs zero queries', async () => {
  const mock = dataSource();
  const result = await resolver.resolveWhatsAppCustomerVariables(customerContext({ existingCustomer: customerA }), mock.source);
  assert.deepEqual(result.metadataSanitized.queryCounts, { customer: 0 });
  assert.deepEqual(mock.counts, { customer: 0, product: 0, category: 0 });
});

test('events without trusted customer context perform zero customer queries', async () => {
  const mock = dataSource();
  const result = await resolver.resolveWhatsAppCustomerVariables(customerContext({ eventKey: 'store_product_request' }), mock.source);
  assert.deepEqual(result.variables, {});
  assert.deepEqual(mock.counts, { customer: 0, product: 0, category: 0 });
});

test('product loader resolves public fields, category and official simple price', async () => {
  const mock = dataSource();
  const result = await resolver.resolveWhatsAppProductVariables(productContext(), mock.source);
  assert.equal(result.variables['produto.nome'], 'Produto A');
  assert.equal(result.variables.produto_nome, 'Produto A');
  assert.equal(result.variables['produto.descricao'], 'Descrição pública');
  assert.equal(result.variables['produto.categoria'], 'Categoria A');
  assert.equal(result.variables['produto.imagem'], 'https://cdn.example.com/a.png');
  assert.equal(result.variables['produto.tipo_venda'], 'unidade');
  assert.equal(result.variables['produto.preco'], 'R$ 20,00');
  assert.equal(result.metadataSanitized.priceSource, 'src/lib/pricing.ts');
  assert.deepEqual(result.metadataSanitized.queryCounts, { product: 1, category: 1 });
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|base_cost|margin|product-a|company-a|category-a/);
});

test('official pricing covers volume, area and linear products and fails closed without dimensions', async () => {
  const volume = { ...productA, volume_pricing: [{ min_qty: 1, price: 9 }, { min_qty: 10, price: 7 }] };
  const volumeResult = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: volume, existingCategory: categoryA, pricingConfig: { quantity: 10 } }), dataSource().source);
  assert.equal(volumeResult.variables['produto.preco'], 'R$ 70,00');

  const area = { ...productA, pricing_type: 'm2', sales_price: 5 };
  const areaResult = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: area, existingCategory: categoryA, pricingConfig: { quantity: 2, width: 2, height: 3 } }), dataSource().source);
  assert.equal(areaResult.variables['produto.preco'], 'R$ 60,00');
  const areaMissing = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: area, existingCategory: categoryA, pricingConfig: { quantity: 2 } }), dataSource().source);
  assert.equal('produto.preco' in areaMissing.variables, false);
  assert.equal(areaMissing.metadataSanitized.priceSource, 'missing');

  const linear = { ...productA, pricing_type: 'linear', sales_price: 5 };
  const linearResult = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: linear, existingCategory: categoryA, pricingConfig: { quantity: 2, length: 4 } }), dataSource().source);
  assert.equal(linearResult.variables['produto.preco'], 'R$ 40,00');
});

test('untrusted option prices are never used and invalid public products fail closed', async () => {
  const missingPrice = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: productA, existingCategory: categoryA, selectedOptionsPresent: true }), dataSource().source);
  assert.equal('produto.preco' in missingPrice.variables, false);
  for (const product of [{ ...productA, active: false }, { ...productA, catalog_active: false }]) {
    await assert.rejects(resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: product, existingCategory: categoryA }), dataSource().source), /PRODUCT_UNAVAILABLE/);
  }
  await assert.rejects(resolver.resolveWhatsAppProductVariables(productContext(), dataSource({ product: null }).source), /PRODUCT_NOT_FOUND/);
});

test('official pricing keeps required non-matrix configuration missing until trusted selections are complete', async () => {
  const configuredProduct = {
    ...productA,
    pricing_details: {
      configurator_options: {
        sale_mode: 'unidade',
        option_groups: [{
          id: 'finish',
          name: 'Acabamento',
          selection_type: 'multiple',
          required: true,
          options: [{ name: 'Laminação', price_delta: 30, additional_days: 1, is_default: false }]
        }]
      }
    }
  };
  const incomplete = await resolver.resolveWhatsAppProductVariables(productContext({
    existingProduct: configuredProduct,
    existingCategory: categoryA,
    pricingConfig: { quantity: 2, customOptions: { selectedOptions: [] } },
    selectedOptionsPresent: false
  }), dataSource().source);
  assert.equal('produto.preco' in incomplete.variables, false);
  assert.equal(incomplete.missing.includes('produto.preco'), true);
  assert.equal(incomplete.metadataSanitized.priceSource, 'missing');

  const complete = await resolver.resolveWhatsAppProductVariables(productContext({
    existingProduct: configuredProduct,
    existingCategory: categoryA,
    pricingConfig: {
      quantity: 2,
      customOptions: { selectedOptions: [{ name: 'Laminação', option_name: 'Laminação', group_id: 'finish', price_delta: 999999 }] }
    },
    selectedOptionsPresent: true
  }), dataSource().source);
  assert.equal(complete.variables['produto.preco'], 'R$ 30,00');
  assert.doesNotMatch(complete.variables['produto.preco'], /999999|20,00/);
});

test('size_grid rehydrates the single official size server-side and ignores tampered browser prices', async () => {
  const sizeGridProduct = {
    ...productA,
    pricing_details: {
      configurator_options: {
        sale_mode: 'size_grid',
        size_options: [
          { name: 'A4', price_delta: 30, additional_days: 1, is_default: true },
          { name: 'A3', price_delta: 50, additional_days: 2, is_default: false }
        ]
      }
    }
  };
  const publicContext = resolver.createStoreProductPricingContext({
    quantity: 2,
    selectedOptions: [{
      name: 'A4',
      group_name: 'Tamanho',
      price: 0.01,
      price_delta: 999999,
      additional_days: 999
    }]
  });
  const result = await resolver.resolveWhatsAppProductVariables(productContext({
    existingProduct: sizeGridProduct,
    existingCategory: categoryA,
    ...publicContext
  }), dataSource().source);

  assert.equal(result.variables['produto.preco'], pricing.formatCurrency(30));
  assert.equal(result.metadataSanitized.priceSource, 'src/lib/pricing.ts');
  assert.deepEqual(result.metadataSanitized.queryCounts, { product: 0, category: 0 });
  assert.doesNotMatch(JSON.stringify(result), /999999|additional_days|price_delta/);
});

test('size_grid fails closed for missing, invalid, ambiguous or malformed official size selections', async () => {
  const configurator = {
    sale_mode: 'size_grid',
    size_options: [{ name: 'A4', price_delta: 30, additional_days: 1, is_default: true }]
  };
  const cases = [
    { configurator, selectedOptions: [] },
    { configurator, selectedOptions: [{ name: 'Inexistente', group_name: 'Tamanho', price_delta: 1 }] },
    { configurator, selectedOptions: [{ name: 'A4', group_name: 'Tamanho' }, { name: 'A4', group_name: 'Tamanho' }] },
    { configurator: { sale_mode: 'size_grid', size_options: null }, selectedOptions: [{ name: 'A4', group_name: 'Tamanho' }] },
    { configurator: { sale_mode: 'size_grid', size_options: [] }, selectedOptions: [{ name: 'A4', group_name: 'Tamanho' }] },
    { configurator: { sale_mode: 'size_grid', size_options: {} }, selectedOptions: [{ name: 'A4', group_name: 'Tamanho' }] },
    { configurator: { sale_mode: 'size_grid', size_options: [{ name: 'A4', price_delta: '30' }] }, selectedOptions: [{ name: 'A4', group_name: 'Tamanho' }] }
  ];

  for (const fixture of cases) {
    const publicContext = resolver.createStoreProductPricingContext({ quantity: 2, selectedOptions: fixture.selectedOptions });
    const result = await resolver.resolveWhatsAppProductVariables(productContext({
      existingProduct: {
        ...productA,
        pricing_details: { configurator_options: fixture.configurator }
      },
      existingCategory: categoryA,
      ...publicContext
    }), dataSource().source);
    assert.equal('produto.preco' in result.variables, false);
    assert.equal(result.missing.includes('produto.preco'), true);
    assert.equal(result.metadataSanitized.priceSource, 'missing');
  }
});

test('6to4 image addresses reuse the embedded IPv4 policy without blocking public fixtures', async () => {
  const rejected = [
    'https://[2002:7f00:1::]/image.jpg',
    'https://[2002:7f00:0001:0000:0000:0000:0000:0000]/image.jpg',
    'https://[2002:a00:1::]/image.jpg',
    'https://[2002:ac10:1::]/image.jpg',
    'https://[2002:c0a8:101::]/image.jpg',
    'https://[2002:a9fe:101::]/image.jpg'
  ];
  for (const imageUrl of rejected) {
    const result = await resolver.resolveWhatsAppProductVariables(productContext({
      existingProduct: { ...productA, image_url: imageUrl },
      existingCategory: categoryA
    }), dataSource().source);
    assert.equal('produto.imagem' in result.variables, false, imageUrl);
    assert.equal(result.missing.includes('produto.imagem'), true);
  }

  const publicFixture = 'https://[2002:808:808::]/image.jpg';
  const accepted = await resolver.resolveWhatsAppProductVariables(productContext({
    existingProduct: { ...productA, image_url: publicFixture },
    existingCategory: categoryA
  }), dataSource().source);
  assert.equal(accepted.variables['produto.imagem'], publicFixture);
});

test('product image accepts only structurally public HTTPS URLs without credentials or sensitive signatures', async () => {
  const accepted = [
    'https://cdn.example.com/a.png',
    'https://cdn.example.com/a.png?width=800&format=webp',
    'https://cdn.example.com/a.png?monkey=value',
    'https://[2001:4860:4860::8888]/a.png',
    'https://[::ffff:808:808]/a.png'
  ];
  for (const imageUrl of accepted) {
    const result = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: { ...productA, image_url: imageUrl }, existingCategory: categoryA }), dataSource().source);
    assert.equal(result.variables['produto.imagem'], imageUrl);
  }

  const rejected = [
    'http://cdn.example.com/a.png',
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://192.168.1.10/a.png',
    'https://10.0.0.1/a.png',
    'https://172.16.0.1/a.png',
    'https://[::1]/a.png',
    'https://[fe80::1]/a.png',
    'https://[fc00::1]/a.png',
    'https://[fec0::1]/image.jpg',
    'https://[feff::1]/image.jpg',
    'https://[febf:ffff::1]/image.jpg',
    'https://[::ffff:127.0.0.1]/image.jpg',
    'https://[::ffff:7f00:1]/image.jpg',
    'https://[::ffff:10.0.0.1]/image.jpg',
    'https://[::ffff:a00:1]/image.jpg',
    'https://[::ffff:172.16.0.1]/image.jpg',
    'https://[::ffff:ac10:1]/image.jpg',
    'https://[::ffff:192.168.1.1]/image.jpg',
    'https://[::ffff:c0a8:101]/image.jpg',
    'https://[::ffff:169.254.1.1]/image.jpg',
    'https://[::ffff:a9fe:101]/image.jpg',
    'https://[::7f00:1]/image.jpg',
    'https://[64:ff9b::7f00:1]/image.jpg',
    'https://assets.internal/a.png',
    'https://user:password@cdn.example.com/a.png',
    'data:image/png;base64,redacted',
    'javascript:alert(1)',
    'https://cdn.example.com/a.png?token=redacted',
    'https://cdn.example.com/a.png?signature=redacted',
    'https://cdn.example.com/a.png?token[]=fixture',
    'https://cdn.example.com/a.png?token[0]=fixture',
    'https://cdn.example.com/a.png?foo[token]=fixture',
    'https://cdn.example.com/a.png?signature.v1=fixture',
    'https://cdn.example.com/a.png?tok%65n=fixture',
    'https://cdn.example.com/a.png?signature%2Ev1=fixture',
    'https://cdn.example.com/a.png?foo%5Btoken%5D=fixture',
    'https://cdn.example.com/a.png?foo[signature]=fixture',
    'https://cdn.example.com/a.png?access_token=fixture',
    'https://cdn.example.com/a.png?access-token=fixture',
    'https://cdn.example.com/a.png?sig.v2=fixture',
    'https://cdn.example.com/a.png?foo[secret]=fixture',
    'https://cdn.example.com/a.png?api_key=fixture',
    'https://cdn.example.com/a.png?expires.v1=fixture',
    'https://cdn.example.com/a.png#token=redacted',
    'https://cdn.example.com/a.png?AWSAccessKeyId=redacted',
    'https://cdn.example.com/a.png?X-Amz-Signature=redacted',
    'https://cdn.example.com/a.png?X-Goog-Credential=redacted'
  ];
  for (const imageUrl of rejected) {
    const result = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: { ...productA, image_url: imageUrl }, existingCategory: categoryA }), dataSource().source);
    assert.equal('produto.imagem' in result.variables, false, imageUrl.split('?')[0]);
    assert.equal(result.missing.includes('produto.imagem'), true);
    assert.doesNotMatch(JSON.stringify(result.metadataSanitized), /redacted|password|image_url/);
  }
});

test('product description converts audited rich text to readable plain text and removes executable content', async () => {
  const cases = [
    ['Texto puro', 'Texto puro'],
    ['<p>Banner <strong>premium</strong></p>', 'Banner premium'],
    ['Linha 1<br>Linha 2', 'Linha 1\nLinha 2'],
    ['<ul><li>Primeiro</li><li>Segundo</li></ul>', '- Primeiro\n- Segundo'],
    ['<p>Seguro</p><script>alert("x")</script><style>body{display:none}</style>', 'Seguro'],
    ['Produto premium&lt;script&gt;alert(1)&lt;/script&gt;Tamanho A4', 'Produto premiumTamanho A4'],
    ['Produto premium&lt;style&gt;body{display:none}&lt;/style&gt;Tamanho A4', 'Produto premiumTamanho A4'],
    ['Produto premium&#60;script&#62;alert(1)&#60;/script&#62;Tamanho A4', 'Produto premiumTamanho A4'],
    ['Produto premium&#x3c;style&#x3e;.x{color:red}&#x3c;/style&#x3e;Tamanho A4', 'Produto premiumTamanho A4'],
    ['&lt;strong&gt;Premium&lt;/strong&gt;', 'Premium'],
    ['&lt;p&gt;Parágrafo&lt;/p&gt;', 'Parágrafo'],
    ['Use &lt; 10 unidades &amp; mantenha o texto', 'Use < 10 unidades & mantenha o texto'],
    ['5 &#60; 10', '5 < 10']
  ];
  for (const [description, expected] of cases) {
    const result = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: { ...productA, description }, existingCategory: categoryA }), dataSource().source);
    assert.equal(result.variables['produto.descricao'], expected);
    assert.doesNotMatch(result.variables['produto.descricao'], /<[^>]+>|alert|display:none/);
  }
  for (const description of [
    '',
    '<p><br></p>',
    null,
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '&lt;style&gt;body{display:none}&lt;/style&gt;',
    '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;',
    '&#60;script&#62;alert(1)&#60;/script&#62;',
    '&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;',
    '&lt;script&#62;alert(1)&lt;/script&#62;',
    '&amp;#60;script&amp;#62;alert(1)&amp;#60;/script&amp;#62;',
    '&#60;style&#62;body{display:none}&#60;/style&#62;',
    '&#x3c;style&#x3e;.x{color:red}&#x3c;/style&#x3e;'
  ]) {
    const result = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: { ...productA, description }, existingCategory: categoryA }), dataSource().source);
    assert.equal('produto.descricao' in result.variables, false);
    assert.equal(result.missing.includes('produto.descricao'), true);
  }
});

test('missing category, description, image and non-calculable price remain missing instead of invented', async () => {
  const product = { ...productA, category_id: null, description: '', image_url: 'javascript:alert(1)', pricing_type: 'm2' };
  const result = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: product, pricingConfig: { quantity: 1 } }), dataSource().source);
  for (const token of ['produto.descricao', 'produto.categoria', 'produto.imagem', 'produto.preco']) {
    assert.equal(token in result.variables, false, token);
    assert.equal(result.missing.includes(token), true, token);
  }
  assert.deepEqual(result.metadataSanitized.queryCounts, { product: 0, category: 0 });
  assert.doesNotMatch(JSON.stringify(result), /undefined|null|NaN|R\$\s*0,00/);
});

test('product and category cross-tenant rows are rejected without partial output', async () => {
  await assert.rejects(resolver.resolveWhatsAppProductVariables(productContext(), dataSource({ product: { ...productA, company_id: 'company-b' } }).source), /TENANT_MISMATCH/);
  await assert.rejects(resolver.resolveWhatsAppProductVariables(productContext(), dataSource({ category: { ...categoryA, company_id: 'company-b' } }).source), /TENANT_MISMATCH/);
});

test('preloaded Store product avoids a second product query and caps category at one query', async () => {
  const mock = dataSource();
  const result = await resolver.resolveWhatsAppProductVariables(productContext({ existingProduct: productA }), mock.source);
  assert.deepEqual(result.metadataSanitized.queryCounts, { product: 0, category: 1 });
  assert.deepEqual(mock.counts, { customer: 0, product: 0, category: 1 });
});

test('Store pricing context ignores browser price deltas and keeps only bounded configuration inputs', () => {
  const result = resolver.createStoreProductPricingContext({
    quantity: 10,
    dimensions: { width: 2, height: 3, length: 4 },
    selectedOptions: [{ name: 'Laminação', group_id: 'finish', group_name: 'Acabamento', price_delta: 999999 }],
    configurationSnapshot: { material: 'Couchê', size: 'A4', colors: '4x4', finishing: 'Fosco', total_price: 1 }
  });
  assert.equal(result.selectedOptionsPresent, true);
  assert.deepEqual(result.pricingConfig, {
    quantity: 10, width: 2, height: 3, length: 4,
    customOptions: {
      variantSelection: { material: 'Couchê', size: 'A4', colors: '4x4', finishing: 'Fosco' },
      selectedOptions: [{ name: 'Laminação', option_name: 'Laminação', group_id: 'finish', group_name: 'Acabamento' }]
    }
  });
  assert.equal('price_delta' in JSON.parse(JSON.stringify(result.pricingConfig)), false);
});

test('Supabase entity datasource uses minimal projections and tenant filters', async () => {
  const selections = [];
  const filters = [];
  const fixtures = { customers: customerA, products: productA, categories: categoryA };
  const client = { from(table) { return { select(columns) {
    selections.push({ table, columns });
    const builder = {
      eq(column, value) { filters.push({ table, column, value }); return builder; },
      async maybeSingle() { return { data: fixtures[table], error: null }; }
    };
    return builder;
  } }; } };
  const source = resolver.createSupabaseWhatsAppEntityDataSource(client);
  await source.getCustomer('company-a', 'customer-a');
  await source.getProduct('company-a', 'product-a');
  await source.getCategory('company-a', 'category-a');
  assert.deepEqual(selections, [
    { table: 'customers', columns: 'id,company_id,name,phone,email,corporate_additional_info' },
    { table: 'products', columns: 'id,company_id,category_id,name,description,pricing_type,sales_price,active,catalog_active,pricing_details,image_url,volume_pricing' },
    { table: 'categories', columns: 'id,company_id,name' }
  ]);
  assert.deepEqual(filters, [
    { table: 'customers', column: 'id', value: 'customer-a' },
    { table: 'customers', column: 'company_id', value: 'company-a' },
    { table: 'products', column: 'id', value: 'product-a' },
    { table: 'products', column: 'company_id', value: 'company-a' },
    { table: 'categories', column: 'id', value: 'category-a' },
    { table: 'categories', column: 'company_id', value: 'company-a' }
  ]);
  assert.equal(selections.some((entry) => entry.columns.includes('*')), false);
});
