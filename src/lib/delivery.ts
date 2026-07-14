/**
 * Utilitario para calculo de frete por distancia no PrintFlowPRO.
 * A chave da OpenRouteService fica protegida no servidor em /api/distance.
 */

type DistanceApiResponse = {
  distance_km?: number;
  duration_minutes?: number | null;
  provider?: string;
  error?: string;
};

export function normalizeDistanceKm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

export async function calculateRouteDistance(origin: string, destination: string): Promise<number> {
  if (!origin || !origin.trim()) {
    throw new Error('Endereço de partida da gráfica não configurado.');
  }

  if (!destination || !destination.trim()) {
    throw new Error('Endereço do cliente não informado.');
  }

  const response = await fetch('/api/distance', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      origin,
      destination,
      profile: 'driving-car'
    })
  });

  const data = (await response.json().catch(() => ({}))) as DistanceApiResponse;

  if (!response.ok) {
    throw new Error(data.error || 'Erro ao calcular distancia pela OpenRouteService.');
  }

  if (typeof data.distance_km !== 'number' || data.distance_km <= 0) {
    throw new Error('Não foi possível obter uma distância válida para a rota.');
  }

  return normalizeDistanceKm(data.distance_km);
}
