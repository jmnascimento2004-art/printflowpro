/**
 * Utilitário para cálculo de frete por distância no PrintFlowPRO.
 * Utiliza as APIs abertas e gratuitas Nominatim (OSM) e OSRM.
 */

interface GeocodeResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface OSRMResult {
  routes: Array<{
    distance: number; // Distância em metros
    duration: number; // Tempo em segundos
  }>;
  code: string;
}

// Cache para geocodificação de endereços para reduzir requisições à API do Nominatim
const geocodeCache: Record<string, { lat: number; lon: number }> = {};

if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('printflowpro_geocode_cache');
    if (saved) {
      Object.assign(geocodeCache, JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Erro ao carregar cache de geocodificação do localStorage:', e);
  }
}

function saveGeocodeCache() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('printflowpro_geocode_cache', JSON.stringify(geocodeCache));
    } catch (e) {
      console.warn('Erro ao salvar cache de geocodificação no localStorage:', e);
    }
  }
}

/**
 * Geocodifica um endereço em texto para coordenadas Latitude e Longitude.
 * Implementa fallbacks por CEP e limpeza de termos para máxima resiliência no Brasil.
 */
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number }> {
  const cacheKey = address.trim().toLowerCase();
  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }

  // 1. Tenta geocodificar o endereço completo primeiro
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'PrintFlowPRO-SaaS-App/1.0' }
    });

    if (response.ok) {
      const data: GeocodeResult[] = await response.json();
      if (data && data.length > 0) {
        const result = {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        };
        geocodeCache[cacheKey] = result;
        saveGeocodeCache();
        return result;
      }
    }
  } catch (e) {
    console.warn('Erro ao consultar endereço completo:', e);
  }

  // 2. Fallback por CEP: Se falhar, tenta extrair o CEP brasileiro da string e buscar diretamente por ele
  const cepMatch = address.match(/(\d{5})-?(\d{3})/);
  if (cepMatch) {
    const cep = cepMatch[0].replace(/\D/g, ''); // CEP limpo
    const cleanCepUrl = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${encodeURIComponent(cep)}&country=Brazil&limit=1`;
    
    try {
      const cepResponse = await fetch(cleanCepUrl, {
        headers: { 'User-Agent': 'PrintFlowPRO-SaaS-App/1.0' }
      });

      if (cepResponse.ok) {
        const cepData: GeocodeResult[] = await cepResponse.json();
        if (cepData && cepData.length > 0) {
          const result = {
            lat: parseFloat(cepData[0].lat),
            lon: parseFloat(cepData[0].lon)
          };
          geocodeCache[cacheKey] = result;
          saveGeocodeCache();
          return result;
        }
      }
    } catch (e) {
      console.warn('Erro ao consultar por CEP:', e);
    }
  }

  // Parse dos componentes do endereço para fallbacks mais amplos
  let street = '';
  let neighborhood = '';
  let city = '';
  let state = '';
  
  try {
    const commaParts = address.split(',');
    const streetPart = commaParts[0] || '';
    street = streetPart.replace(/\d+/, '').trim(); // Remove o número residencial

    const rest = commaParts.slice(1).join(', ');
    let cleanRest = rest.replace(/CEP\s*\d{5}-?\d{3}/gi, '').trim();
    
    const parts = cleanRest.split(/[-,]/).map(p => p.trim()).filter(Boolean);
    
    if (parts.length >= 3) {
      neighborhood = parts[parts.length - 3];
      city = parts[parts.length - 2];
      state = parts[parts.length - 1];
    } else if (parts.length === 2) {
      city = parts[0];
      state = parts[1];
    } else if (parts.length === 1) {
      city = parts[0];
    }
  } catch (e) {
    console.warn('Erro ao parsear partes do endereço:', e);
  }

  // 3. Fallback: Rua + Cidade + Estado + Brasil (sem número e bairro que possam falhar)
  if (street && city) {
    const query = `${street}, ${city} - ${state}, Brazil`;
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    try {
      const response = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'PrintFlowPRO-SaaS-App/1.0' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
          geocodeCache[cacheKey] = result;
          saveGeocodeCache();
          return result;
        }
      }
    } catch (e) {
      console.warn('Erro no fallback Rua+Cidade:', e);
    }
  }

  // 4. Fallback: Bairro + Cidade + Estado + Brasil (se a rua for muito nova ou não cadastrada)
  if (neighborhood && city) {
    const query = `${neighborhood}, ${city} - ${state}, Brazil`;
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    try {
      const response = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'PrintFlowPRO-SaaS-App/1.0' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
          geocodeCache[cacheKey] = result;
          saveGeocodeCache();
          return result;
        }
      }
    } catch (e) {
      console.warn('Erro no fallback Bairro+Cidade:', e);
    }
  }

  // 5. Fallback final: Apenas Cidade + Estado + Brasil
  if (city) {
    const query = `${city} - ${state}, Brazil`;
    const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    try {
      const response = await fetch(fallbackUrl, {
        headers: { 'User-Agent': 'PrintFlowPRO-SaaS-App/1.0' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
          geocodeCache[cacheKey] = result;
          saveGeocodeCache();
          return result;
        }
      }
    } catch (e) {
      console.warn('Erro no fallback Cidade:', e);
    }
  }

  throw new Error(`Endereço não localizado: "${address}"`);
}

/**
 * Calcula a distância rodoviária real (em quilômetros) entre a origem e o destino.
 * Caso falhe ou não encontre rota, lança um erro para tratamento na UI.
 */
export async function calculateRouteDistance(origin: string, destination: string): Promise<number> {
  if (!origin || !origin.trim()) {
    throw new Error('Endereço de partida da gráfica não configurado.');
  }
  if (!destination || !destination.trim()) {
    throw new Error('Endereço do cliente não informado.');
  }

  // 1. Obter coordenadas da origem (Gráfica)
  let originCoords;
  try {
    originCoords = await geocodeAddress(origin);
  } catch (error: any) {
    throw new Error(`Erro na Origem: ${error.message || 'Verifique o endereço da gráfica nas configurações.'}`);
  }

  // 2. Obter coordenadas do destino (Cliente)
  let destCoords;
  try {
    destCoords = await geocodeAddress(destination);
  } catch (error: any) {
    throw new Error(`Erro no Destino: ${error.message || 'Verifique o endereço do cliente.'}`);
  }

  // 3. Consultar roteador OSRM para trajeto de carro
  const routeUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`;
  
  const routeResponse = await fetch(routeUrl);
  if (!routeResponse.ok) {
    throw new Error('Serviço de cálculo de rotas offline.');
  }

  const routeData: OSRMResult = await routeResponse.json();

  if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
    throw new Error('Não foi possível traçar uma rota terrestre entre os dois endereços.');
  }

  // Distância em metros convertida para quilômetros
  const distanceKm = routeData.routes[0].distance / 1000;
  
  // Arredonda para 2 casas decimais
  return Math.round(distanceKm * 100) / 100;
}
