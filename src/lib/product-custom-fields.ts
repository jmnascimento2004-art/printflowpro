export type ProductFieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'measure';
export interface ProductCustomField {
  id: string;
  label: string;
  type: ProductFieldType;
  required: boolean;
  options?: string[];
}
export interface ProductFieldSnapshot { id: string; label: string; type: ProductFieldType; value: string | number | boolean }
export type ProductFieldValues = Record<string, string | number | boolean>;
const types = new Set(['text', 'textarea', 'number', 'select', 'checkbox', 'date', 'measure']);

export function validateProductFields(fields: ProductCustomField[]): string[] {
  const ids = new Set<string>();
  const errors: string[] = [];
  if (fields.length > 30) errors.push('Use no máximo 30 campos por produto.');
  for (const field of fields) {
    if (!field.id || ids.has(field.id) || !field.label.trim() || field.label.length > 100 || !types.has(field.type)) errors.push('Campo sem nome, com identificador repetido ou tipo inválido.');
    ids.add(field.id);
    if (field.type === 'select' && (!field.options?.length || field.options.some(option => !option.trim()) || new Set(field.options).size !== field.options.length)) errors.push(`Configure opções únicas em ${field.label}.`);
  }
  return [...new Set(errors)];
}

/** Values have no monetary meaning. Labels/types are frozen from the trusted product. */
export function resolveProductFields(fields: ProductCustomField[] = [], values: ProductFieldValues = {}) {
  const errors = validateProductFields(fields);
  const snapshot: ProductFieldSnapshot[] = [];
  for (const field of fields) {
    const value = values[field.id];
    const empty = value === undefined || value === '' || (typeof value === 'string' && !value.trim());
    if (empty) { if (field.required) errors.push(`Preencha ${field.label}.`); continue; }
    let valid = false;
    if (field.type === 'checkbox') valid = typeof value === 'boolean' && (!field.required || value);
    else if (field.type === 'number' || field.type === 'measure') valid = (typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)) && (field.type !== 'measure' || Number(value) >= 0);
    else if (field.type === 'select') valid = typeof value === 'string' && Boolean(field.options?.includes(value));
    else if (field.type === 'date') valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    else valid = typeof value === 'string' && value.length <= 2000;
    if (!valid) { errors.push(`Valor inválido em ${field.label}.`); continue; }
    snapshot.push({ id: field.id, label: field.label, type: field.type, value: field.type === 'number' || field.type === 'measure' ? Number(value) : value });
  }
  return { errors, snapshot };
}

export function productFieldsSummary(snapshot: ProductFieldSnapshot[]) {
  return snapshot.map(field => `${field.label}: ${typeof field.value === 'boolean' ? field.value ? 'Sim' : 'Não' : field.value}${field.type === 'measure' ? ' m' : ''}`).join(' | ');
}
