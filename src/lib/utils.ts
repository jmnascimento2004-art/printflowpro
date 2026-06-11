/**
 * Utility helper functions for PrintFlowPRO
 */

/**
 * Calculates the CRC16 checksum for the PIX payload
 */
function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  const crcHex = crc.toString(16).toUpperCase();
  return crcHex.padStart(4, '0');
}

/**
 * Generates a standard, valid, and scannable BR Code PIX payload
 * (No bank APIs required, works locally conforming to Banco Central standards)
 */
export function generatePixPayload(key: string, amount: number, merchantName: string = 'PrintFlowPRO', merchantCity: string = 'SAO PAULO'): string {
  let cleanKey = key.trim();
  
  if (cleanKey.includes('@')) {
    // Email key, keep as is
  } else if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cleanKey) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(cleanKey)) {
    // CPF or CNPJ key, remove formatting
    cleanKey = cleanKey.replace(/\D/g, '');
  } else if (/^\+?\d{10,13}$/.test(cleanKey.replace(/\D/g, ''))) {
    // Phone key, must start with +55 for BCB standard
    const numeric = cleanKey.replace(/\D/g, '');
    cleanKey = numeric.startsWith('55') ? `+55${numeric.substring(2)}` : `+55${numeric}`;
  } else {
    // UUID / Random key (EVP)
    cleanKey = cleanKey.replace(/\s/g, '');
  }

  const payloadFormat = '000201';
  const initiationMethod = '010211'; // Static PIX payload method

  // Merchant Account Info (ID 26)
  const gui = '0014br.gov.bcb.pix';
  const keyLength = String(cleanKey.length).padStart(2, '0');
  const keyField = `01${keyLength}${cleanKey}`;
  const merchantAccountInfo = `26${String(gui.length + keyField.length).padStart(2, '0')}${gui}${keyField}`;

  const categoryCode = '52040000'; // General Merchant
  const currencyCode = '5303986'; // ISO 4217 for BRL (986)

  // Transaction Amount (ID 54)
  const amountStr = amount.toFixed(2);
  const amountField = amount > 0 
    ? `54${String(amountStr.length).padStart(2, '0')}${amountStr}` 
    : '';

  const countryCode = '5802BR';

  // Merchant Name (ID 59)
  const cleanName = merchantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 25);
  const nameLength = String(cleanName.length).padStart(2, '0');
  const merchantNameField = `59${nameLength}${cleanName}`;

  // Merchant City (ID 60)
  const cleanCity = merchantCity.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 15);
  const cityLength = String(cleanCity.length).padStart(2, '0');
  const merchantCityField = `60${cityLength}${cleanCity}`;

  // Additional Data (ID 62)
  const additionalData = '62070503***';

  const partPayload = `${payloadFormat}${initiationMethod}${merchantAccountInfo}${categoryCode}${currencyCode}${amountField}${countryCode}${merchantNameField}${merchantCityField}${additionalData}6304`;
  const crc = calculateCRC16(partPayload);
  
  return `${partPayload}${crc}`;
}

/**
 * Formats a raw number or string value as R$ Currency input format
 * e.g. 10.5 -> "R$ 10,50"
 */
export function formatCurrencyInput(value: number | string): string {
  if (value === undefined || value === null) return 'R$ 0,00';
  
  let cleanValue = '';
  if (typeof value === 'number') {
    cleanValue = Math.round(value * 100).toString();
  } else {
    cleanValue = value.replace(/\D/g, '');
  }

  if (!cleanValue || cleanValue === '0') return 'R$ 0,00';

  const cents = parseInt(cleanValue, 10);
  const floatVal = cents / 100;
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(floatVal);
}

/**
 * Parses a currency input string (e.g. "R$ 1.250,50") back to a standard float number (1250.5)
 */
export function parseCurrencyInputToNumber(formattedValue: string): number {
  const clean = formattedValue.replace(/\D/g, '');
  if (!clean) return 0;
  return parseInt(clean, 10) / 100;
}

/**
 * Validates a CNPJ string
 */
export function validateCNPJ(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return false;
  
  // Reject simple repeating patterns
  if (/^(\d)\1{13}$/.test(clean)) return false;

  // Validate digit 1
  let length = 12;
  let numbers = clean.substring(0, length);
  const digits = clean.substring(length);
  let sum = 0;
  let pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0), 10)) return false;

  // Validate digit 2
  length = 13;
  numbers = clean.substring(0, length);
  sum = 0;
  pos = length - 7;
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i), 10) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1), 10)) return false;

  return true;
}

/**
 * Formats CNPJ as xx.xxx.xxx/xxxx-xx
 */
export function formatCNPJ(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.substring(0, 2)}.${clean.substring(2)}`;
  if (clean.length <= 8) return `${clean.substring(0, 2)}.${clean.substring(2, 5)}.${clean.substring(5)}`;
  if (clean.length <= 12) return `${clean.substring(0, 2)}.${clean.substring(2, 5)}.${clean.substring(5, 8)}/${clean.substring(8)}`;
  return `${clean.substring(0, 2)}.${clean.substring(2, 5)}.${clean.substring(5, 8)}/${clean.substring(8, 12)}-${clean.substring(12, 14)}`;
}

/**
 * Validates a CEP string
 */
export function validateCEP(cep: string): boolean {
  const clean = cep.replace(/\D/g, '');
  return clean.length === 8;
}

/**
 * Formats CEP as xxxxx-xxx
 */
export function formatCEP(cep: string): string {
  const clean = cep.replace(/\D/g, '');
  if (clean.length <= 5) return clean;
  return `${clean.substring(0, 5)}-${clean.substring(5, 8)}`;
}

export function stripRichTextHtml(value: string = ''): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeRichTextHtml(value: string = ''): string {
  const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'ul', 'ol', 'li'];
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  if (!hasHtml) {
    return escapeHtml(value).replace(/\n/g, '<br />');
  }

  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, tag) => {
      const cleanTag = String(tag).toLowerCase();
      if (!allowedTags.includes(cleanTag)) return '';
      return match.startsWith('</') ? `</${cleanTag}>` : `<${cleanTag}>`;
    })
    .trim();
}

/**
 * Formats CPF as xxx.xxx.xxx-xx
 */
export function formatCPF(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length <= 3) return clean;
  if (clean.length <= 6) return `${clean.substring(0, 3)}.${clean.substring(3)}`;
  if (clean.length <= 9) return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6)}`;
  return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9, 11)}`;
}

/**
 * Retorna o preço unitário do produto com base na quantidade, considerando as faixas de volume
 */
export function getProductUnitPrice(product: any, quantity: number): number {
  if (!product || typeof product.sales_price !== 'number') return 0;
  if (!product.volume_pricing || !Array.isArray(product.volume_pricing) || product.volume_pricing.length === 0) {
    return product.sales_price;
  }
  // Ordena as faixas por min_qty decrescente
  const sortedTiers = [...product.volume_pricing].sort((a: any, b: any) => b.min_qty - a.min_qty);
  // Encontra a primeira faixa que a quantidade atende
  const matchingTier = sortedTiers.find((tier: any) => quantity >= tier.min_qty);
  return matchingTier ? matchingTier.price : product.sales_price;
}
