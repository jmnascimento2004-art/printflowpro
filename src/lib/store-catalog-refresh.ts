export const STORE_CATALOG_REFRESH_EVENT = 'printflowpro:store-catalog-refresh';
export const STORE_CATALOG_REFRESH_CHANNEL = 'printflowpro-store-catalog-refresh';

type StoreCatalogRefreshPayload = {
  companyId?: string | null;
  productId?: string | null;
};

export function notifyStoreCatalogRefresh(payload: StoreCatalogRefreshPayload = {}) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(STORE_CATALOG_REFRESH_EVENT, { detail: payload }));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(STORE_CATALOG_REFRESH_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  }
}
