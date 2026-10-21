import type { Shipment } from './dummy-data';

function timestampVersion(value?: string): bigint | null {
  if (!value) return null;
  const match = value.match(/^(.*?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;
  const seconds = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(seconds)) return null;
  return BigInt(seconds) * BigInt(1000) + BigInt((match[2] || '').padEnd(6, '0').slice(0, 6));
}

/** Ignore older responses/events, including snapshots that began before a command. */
export function replaceShipment(items: Shipment[], incoming: Shipment): Shipment[] {
  const current = items.find((item) => item.id === incoming.id);
  const incomingVersion = timestampVersion(incoming.updated_at);
  if (incomingVersion === null) return items;
  if (!current) return [...items, incoming];
  if (current.company_id !== incoming.company_id) return items;
  const currentVersion = timestampVersion(current.updated_at);
  if (currentVersion !== null && incomingVersion <= currentVersion) return items;
  return items.map((item) => item.id === incoming.id ? incoming : item);
}

export function mergeShipmentSnapshot(items: Shipment[], incoming: Shipment[]): Shipment[] {
  return incoming.reduce(replaceShipment, items);
}
