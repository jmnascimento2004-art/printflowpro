import { NextResponse } from 'next/server';
import { warnCaught } from '@/lib/safe-log';

type OrsGeocodeResponse = {
  features?: Array<{
    geometry?: {
      coordinates?: [number, number];
    };
    properties?: {
      label?: string;
      locality?: string;
      localadmin?: string;
      county?: string;
      region?: string;
      region_a?: string;
      postalcode?: string;
      confidence?: number;
    };
  }>;
};

type NominatimGeocodeResponse = Array<{
  lat?: string;
  lon?: string;
  display_name?: string;
  class?: string;
  type?: string;
}>;

type OrsDirectionsResponse = {
  routes?: Array<{
    summary?: {
      distance?: number;
      duration?: number;
    };
  }>;
  features?: Array<{
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
    };
  }>;
};

type Coordinates = [number, number];

type GeocodeCandidate = {
  coordinates: Coordinates;
  label: string;
  source: 'openrouteservice' | 'nominatim';
  precision: 'address' | 'area';
};

const ORS_BASE_URL = 'https://api.openrouteservice.org';

const BRAZIL_STATE_NAMES: Record<string, string> = {
  AC: 'acre',
  AL: 'alagoas',
  AP: 'amapa',
  AM: 'amazonas',
  BA: 'bahia',
  CE: 'ceara',
  DF: 'distrito federal',
  ES: 'espirito santo',
  GO: 'goias',
  MA: 'maranhao',
  MT: 'mato grosso',
  MS: 'mato grosso do sul',
  MG: 'minas gerais',
  PA: 'para',
  PB: 'paraiba',
  PR: 'parana',
  PE: 'pernambuco',
  PI: 'piaui',
  RJ: 'rio de janeiro',
  RN: 'rio grande do norte',
  RS: 'rio grande do sul',
  RO: 'rondonia',
  RR: 'roraima',
  SC: 'santa catarina',
  SP: 'sao paulo',
  SE: 'sergipe',
  TO: 'tocantins'
};

function getOpenRouteServiceKey() {
  return (
    process.env.OPENROUTESERVICE_API_KEY ||
    process.env.ORS_API_KEY ||
    process.env.OPEN_ROUTE_SERVICE_API_KEY ||
    ''
  );
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isSameCoordinates(originCoordinates: Coordinates, destinationCoordinates: Coordinates) {
  return (
    Math.abs(originCoordinates[0] - destinationCoordinates[0]) < 0.00001 &&
    Math.abs(originCoordinates[1] - destinationCoordinates[1]) < 0.00001
  );
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniqueCandidates(candidates: GeocodeCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter(({ coordinates: [lon, lat] }) => {
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBrazilianAddress(address: string) {
  const cep = address.match(/\b\d{5}-?\d{3}\b/)?.[0]?.replace(/\D/g, '') || '';
  const withoutCep = address.replace(/,?\s*CEP\s*\d{5}-?\d{3}/gi, '').trim();
  const addressParts = withoutCep.split(/\s+-\s+/);
  const streetNumberPart = addressParts.shift() || '';
  const rest = addressParts.join(' - ');
  const streetMatch = streetNumberPart.match(/^(.+?),\s*([^,]+)$/);
  const street = streetMatch?.[1]?.trim() || streetNumberPart.trim();
  const number = streetMatch?.[2]?.trim() || '';
  const restParts = rest.split(',').map(part => part.trim()).filter(Boolean);
  const neighborhood = restParts[0] || '';
  const cityState = restParts[1] || restParts[0] || '';
  const state = cityState.match(/\b[A-Z]{2}\b/)?.[0] || '';
  const city = cityState.replace(/\s*-\s*[A-Z]{2}\b/, '').trim();

  return { cep, street, number, neighborhood, city, state };
}

function candidateMatchesParsedAddress(candidate: GeocodeCandidate, parsed: ReturnType<typeof parseBrazilianAddress>) {
  const label = normalizeText(candidate.label);
  const expectedState = parsed.state?.trim().toUpperCase();
  const expectedStateName = expectedState ? BRAZIL_STATE_NAMES[expectedState] : '';
  const expectedCity = normalizeText(parsed.city || '');

  if (expectedState && !label.includes(` ${expectedState.toLowerCase()}`) && !label.includes(`-${expectedState.toLowerCase()}`) && !label.includes(`, ${expectedState.toLowerCase()}`) && !label.includes(expectedStateName)) {
    return false;
  }

  if (expectedCity && !label.includes(expectedCity)) {
    return false;
  }

  return true;
}

async function fetchOrsGeocode(url: URL, parsed: ReturnType<typeof parseBrazilianAddress>) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return [];

  const data = (await response.json()) as OrsGeocodeResponse;
  return uniqueCandidates(
    (data.features || [])
      .map<GeocodeCandidate | null>(feature => {
        const coordinates = feature.geometry?.coordinates;
        if (!coordinates || coordinates.length < 2) return null;

        const props = feature.properties || {};
        const label = [
          props.label,
          props.locality,
          props.localadmin,
          props.county,
          props.region,
          props.region_a,
          props.postalcode
        ].filter(Boolean).join(', ');

        return {
          coordinates,
          label,
          source: 'openrouteservice' as const,
          precision: props.postalcode || props.label?.match(/\d/) ? 'address' : 'area'
        };
      })
      .filter((candidate): candidate is GeocodeCandidate => Boolean(candidate))
      .filter(candidate => candidateMatchesParsedAddress(candidate, parsed))
  );
}

async function fetchNominatimCandidates(parsed: ReturnType<typeof parseBrazilianAddress>) {
  const queries = [
    `${parsed.street} ${parsed.number} ${parsed.neighborhood} ${parsed.city} ${parsed.state} Brasil`,
    `${parsed.street} ${parsed.neighborhood} ${parsed.city} ${parsed.state} Brasil`,
    `${parsed.neighborhood} ${parsed.city} ${parsed.state} Brasil`,
    `${parsed.city} ${parsed.state} Brasil`
  ].filter(query => query.replace(/\s+/g, '').length > 10);

  const candidates: GeocodeCandidate[] = [];

  for (const query of queries) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('limit', '5');
    url.searchParams.set('q', query);

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'PrintFlowPRO distance validation'
      }
    });

    if (!response.ok) continue;

    const data = (await response.json()) as NominatimGeocodeResponse;
    candidates.push(...data
      .map<GeocodeCandidate | null>(item => {
        const lon = Number(item.lon);
        const lat = Number(item.lat);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

        const precision: GeocodeCandidate['precision'] = item.class === 'highway' || item.class === 'place' || item.type === 'administrative' || item.class === 'boundary'
          ? 'area'
          : 'address';

        return {
          coordinates: [lon, lat] as Coordinates,
          label: item.display_name || query,
          source: 'nominatim' as const,
          precision
        };
      })
      .filter((candidate): candidate is GeocodeCandidate => Boolean(candidate))
      .filter(candidate => candidateMatchesParsedAddress(candidate, parsed)));

    if (candidates.length > 0) break;
  }

  return uniqueCandidates(candidates);
}

async function geocodeAddressCandidates(address: string, apiKey: string): Promise<GeocodeCandidate[]> {
  const parsed = parseBrazilianAddress(address);
  const candidates: GeocodeCandidate[] = [];

  if (parsed.street && parsed.city) {
    const structuredUrl = new URL('/geocode/search/structured', ORS_BASE_URL);
    structuredUrl.searchParams.set('api_key', apiKey);
    structuredUrl.searchParams.set('address', `${parsed.street}${parsed.number ? `, ${parsed.number}` : ''}`);
    if (parsed.neighborhood) structuredUrl.searchParams.set('neighbourhood', parsed.neighborhood);
    structuredUrl.searchParams.set('locality', parsed.city);
    if (parsed.state) structuredUrl.searchParams.set('region', parsed.state);
    if (parsed.cep) structuredUrl.searchParams.set('postalcode', parsed.cep);
    structuredUrl.searchParams.set('country', 'BR');
    structuredUrl.searchParams.set('size', '5');
    candidates.push(...await fetchOrsGeocode(structuredUrl, parsed));
  }

  const url = new URL('/geocode/search', ORS_BASE_URL);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('text', address);
  url.searchParams.set('boundary.country', 'BR');
  url.searchParams.set('size', '5');
  candidates.push(...await fetchOrsGeocode(url, parsed));

  if (parsed.cep) {
    const cepUrl = new URL('/geocode/search', ORS_BASE_URL);
    cepUrl.searchParams.set('api_key', apiKey);
    cepUrl.searchParams.set('text', `${parsed.cep}, ${parsed.city}, ${parsed.state}, Brasil`);
    cepUrl.searchParams.set('boundary.country', 'BR');
    cepUrl.searchParams.set('size', '3');
    candidates.push(...await fetchOrsGeocode(cepUrl, parsed));
  }

  const unique = uniqueCandidates(candidates);
  const addressLevelCandidates = unique.filter(candidate => candidate.precision === 'address');
  if (addressLevelCandidates.length > 0) return addressLevelCandidates;

  const nominatimCandidates = await fetchNominatimCandidates(parsed);
  const nominatimAddressCandidates = nominatimCandidates.filter(candidate => candidate.precision === 'address');
  if (nominatimAddressCandidates.length > 0) return nominatimAddressCandidates;
  if (nominatimCandidates.length > 0) return nominatimCandidates;

  return unique;
}

async function geocodeAddress(address: string, apiKey: string): Promise<GeocodeCandidate[]> {
  const candidates = await geocodeAddressCandidates(address, apiKey);

  if (candidates.length === 0) {
    const parsed = parseBrazilianAddress(address);
    throw new Error(`Endereco nao localizado com seguranca em ${parsed.city || 'cidade nao informada'}/${parsed.state || 'UF nao informada'}: ${address}`);
  }

  return candidates;
}

function readDistanceFromDirections(data: OrsDirectionsResponse) {
  return (
    data.routes?.[0]?.summary ||
    data.features?.[0]?.properties?.summary ||
    null
  );
}

async function calculateOpenRouteServiceRoute(
  apiKey: string,
  profile: string,
  originCandidate: GeocodeCandidate,
  destinationCandidate: GeocodeCandidate
) {
  const originCoordinates = originCandidate.coordinates;
  const destinationCoordinates = destinationCandidate.coordinates;
  const response = await fetch(`${ORS_BASE_URL}/v2/directions/${profile}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      coordinates: [originCoordinates, destinationCoordinates],
      instructions: false,
      units: 'km'
    })
  });

  if (!response.ok) return null;

  const routeData = (await response.json()) as OrsDirectionsResponse;
  const summary = readDistanceFromDirections(routeData);

  if (!summary?.distance || summary.distance <= 0) return null;

  return {
    distanceKm: Math.round(summary.distance * 100) / 100,
    durationMinutes: summary.duration ? Math.round((summary.duration / 60) * 100) / 100 : null,
    originCoordinates,
    destinationCoordinates,
    originPrecision: originCandidate.precision,
    destinationPrecision: destinationCandidate.precision,
    originLabel: originCandidate.label,
    destinationLabel: destinationCandidate.label
  };
}

async function chooseBestRoutedPair(
  apiKey: string,
  profile: string,
  originCandidates: GeocodeCandidate[],
  destinationCandidates: GeocodeCandidate[]
) {
  const routeResults = [];

  for (const originCandidate of originCandidates.slice(0, 5)) {
    for (const destinationCandidate of destinationCandidates.slice(0, 5)) {
      if (isSameCoordinates(originCandidate.coordinates, destinationCandidate.coordinates)) continue;

      const route = await calculateOpenRouteServiceRoute(
        apiKey,
        profile,
        originCandidate,
        destinationCandidate
      );

      if (route) routeResults.push(route);
    }
  }

  if (routeResults.length === 0) return null;

  return routeResults.sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

export async function POST(request: Request) {
  try {
    const apiKey = getOpenRouteServiceKey();
    if (!apiKey) {
      return jsonError('OPENROUTESERVICE_API_KEY nao configurada no servidor.', 500);
    }

    const body = (await request.json()) as {
      origin?: string;
      destination?: string;
      profile?: string;
    };

    const origin = body.origin?.trim();
    const destination = body.destination?.trim();

    if (!origin) return jsonError('Endereco de origem nao informado.');
    if (!destination) return jsonError('Endereco de destino nao informado.');

    const [originCandidates, destinationCandidates] = await Promise.all([
      geocodeAddress(origin, apiKey),
      geocodeAddress(destination, apiKey)
    ]);

    const profile = body.profile || 'driving-car';
    const route = await chooseBestRoutedPair(apiKey, profile, originCandidates, destinationCandidates);

    if (!route) {
      return jsonError('A OpenRouteService nao retornou uma rota de percurso valida. Confira numero, CEP e bairro.', 502);
    }

    return NextResponse.json({
      distance_km: route.distanceKm,
      duration_minutes: route.durationMinutes,
      provider: 'openrouteservice-route',
      origin_coordinates: route.originCoordinates,
      destination_coordinates: route.destinationCoordinates,
      origin_precision: route.originPrecision,
      destination_precision: route.destinationPrecision,
      origin_label: route.originLabel,
      destination_label: route.destinationLabel
    });
  } catch (error) {
    warnCaught('Erro capturado:', error);
    return jsonError(error instanceof Error ? error.message : 'Erro ao calcular distancia.', 500);
  }
}
