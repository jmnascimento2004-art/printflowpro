import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { warnCaught } from '@/lib/safe-log';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import {
  DISTANCE_BODY_MAX_BYTES,
  calculateEstimatedDistanceKm,
  createCandidatePairs,
  createDistanceCacheKey,
  createDistanceRateKey,
  fetchJsonWithTimeout,
  isAuthorizedDistanceIdentity,
  validateDistancePayload
} from '@/lib/security/distance-request.mjs';

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
type RouteResult = {
  distanceKm: number;
  durationMinutes: number | null;
  originCoordinates: Coordinates;
  destinationCoordinates: Coordinates;
  originPrecision: GeocodeCandidate['precision'];
  destinationPrecision: GeocodeCandidate['precision'];
  originLabel: string;
  destinationLabel: string;
  provider: string;
};

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
  const data = await fetchJsonWithTimeout(url, { cache: 'no-store' }) as OrsGeocodeResponse | null;
  if (!data) return [];
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

  for (const query of queries.slice(0, 1)) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('limit', '5');
    url.searchParams.set('q', query);

    const data = await fetchJsonWithTimeout(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'PrintFlowPRO distance validation' }
    }) as NominatimGeocodeResponse | null;
    if (!data) continue;
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

  if (apiKey && parsed.street && parsed.city) {
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

  if (apiKey) {
    const url = new URL('/geocode/search', ORS_BASE_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('text', address);
    url.searchParams.set('boundary.country', 'BR');
    url.searchParams.set('size', '5');
    candidates.push(...await fetchOrsGeocode(url, parsed));
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
    throw new Error(`Endereco nao localizado com seguranca (${parsed.city ? 'cidade informada' : 'cidade ausente'}/${parsed.state ? 'UF informada' : 'UF ausente'}).`);
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
  const routeData = await fetchJsonWithTimeout(`${ORS_BASE_URL}/v2/directions/${profile}`, {
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
    }) as OrsDirectionsResponse | null;
  if (!routeData) return null;
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
    destinationLabel: destinationCandidate.label,
    provider: 'openrouteservice-route'
  };
}

async function calculateOsrmRoute(
  originCandidate: GeocodeCandidate,
  destinationCandidate: GeocodeCandidate
): Promise<RouteResult | null> {
  const originCoordinates = originCandidate.coordinates;
  const destinationCoordinates = destinationCandidate.coordinates;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${originCoordinates[0]},${originCoordinates[1]};${destinationCoordinates[0]},${destinationCoordinates[1]}`);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('alternatives', 'false');

  try {
    const data = await fetchJsonWithTimeout(url, { cache: 'no-store' }) as { routes?: Array<{ distance?: number; duration?: number }> } | null;
    if (!data) return null;
    const route = data.routes?.[0];
    if (!route?.distance || route.distance <= 0) return null;

    return {
      distanceKm: Math.round((route.distance / 1000) * 100) / 100,
      durationMinutes: route.duration ? Math.round((route.duration / 60) * 100) / 100 : null,
      originCoordinates,
      destinationCoordinates,
      originPrecision: originCandidate.precision,
      destinationPrecision: destinationCandidate.precision,
      originLabel: originCandidate.label,
      destinationLabel: destinationCandidate.label,
      provider: 'osrm-route'
    };
  } catch (error) {
    warnCaught('Falha ao consultar rota do OSRM:', error);
    return null;
  }
}

function calculateEstimatedRoadDistance(
  originCandidate: GeocodeCandidate,
  destinationCandidate: GeocodeCandidate
): RouteResult {
  const [originLon, originLat] = originCandidate.coordinates;
  const [destinationLon, destinationLat] = destinationCandidate.coordinates;
  const estimatedRoadKm = calculateEstimatedDistanceKm(
    [originLon, originLat],
    [destinationLon, destinationLat]
  );

  return {
    distanceKm: estimatedRoadKm,
    durationMinutes: null,
    originCoordinates: originCandidate.coordinates,
    destinationCoordinates: destinationCandidate.coordinates,
    originPrecision: originCandidate.precision,
    destinationPrecision: destinationCandidate.precision,
    originLabel: originCandidate.label,
    destinationLabel: destinationCandidate.label,
    provider: 'estimated-geocoded-distance'
  };
}

async function chooseBestRoutedPair(
  apiKey: string,
  profile: string,
  originCandidates: GeocodeCandidate[],
  destinationCandidates: GeocodeCandidate[]
) {
  const routeResults: RouteResult[] = [];

  for (const [originCandidate, destinationCandidate] of createCandidatePairs(originCandidates, destinationCandidates)) {
      if (isSameCoordinates(originCandidate.coordinates, destinationCandidate.coordinates)) continue;

      const route = apiKey
        ? await calculateOpenRouteServiceRoute(apiKey, profile, originCandidate, destinationCandidate)
        : await calculateOsrmRoute(originCandidate, destinationCandidate);

      if (route) routeResults.push(route);
  }

  if (routeResults.length > 0) {
    return routeResults.sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }

  const originCandidate = originCandidates[0];
  const destinationCandidate = destinationCandidates[0];
  if (originCandidate && destinationCandidate && !isSameCoordinates(originCandidate.coordinates, destinationCandidate.coordinates)) {
    if (apiKey) {
      const osrmRoute = await calculateOsrmRoute(originCandidate, destinationCandidate);
      if (osrmRoute) return osrmRoute;
    }
    return calculateEstimatedRoadDistance(originCandidate, destinationCandidate);
  }

  return null;
}

async function getAuthenticatedUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  const cookieStore = await cookies();
  const client = createServerClient(supabaseUrl, supabaseKey, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined }
  });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('id').eq('auth_user_id', user.id).eq('active', true).maybeSingle();
  return isAuthorizedDistanceIdentity(user, profile) ? user : null;
}

export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return jsonError('Requisicao invalida.', 415);
    }
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > DISTANCE_BODY_MAX_BYTES) return jsonError('Requisicao invalida.', 413);

    const user = await getAuthenticatedUser();
    if (!user) return jsonError('Nao autorizado.', 401);

    const apiKey = getOpenRouteServiceKey();
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > DISTANCE_BODY_MAX_BYTES) return jsonError('Requisicao invalida.', 413);
    const body = (() => {
      try { return JSON.parse(rawBody) as unknown; } catch { return null; }
    })();
    const payload = validateDistancePayload(body);
    if (!payload) return jsonError('Dados de rota invalidos.', 400);
    const { origin, destination, profile } = payload;
    const admin = getSupabaseAdminClient();
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
    const rateKey = createDistanceRateKey(user.id, ip);
    const { data: allowed, error: rateError } = await admin.rpc('consume_distance_rate_limit', {
      p_key: rateKey, p_limit: 20, p_window_seconds: 900
    });
    if (rateError || !allowed) return jsonError('Limite de consultas excedido.', 429);

    const cacheKey = createDistanceCacheKey(origin, destination, profile);
    const { data: cached } = await admin.from('distance_route_cache').select('response').eq('cache_key', cacheKey).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (cached?.response) return NextResponse.json(cached.response, { headers: { 'Cache-Control': 'private, max-age=60' } });

    const [originCandidates, destinationCandidates] = await Promise.all([
      geocodeAddress(origin, apiKey),
      geocodeAddress(destination, apiKey)
    ]);

    const route = await chooseBestRoutedPair(apiKey, profile, originCandidates, destinationCandidates);

    if (!route) {
      return jsonError('Nao foi possivel calcular a rota. Confira numero, CEP, bairro e cidade dos enderecos.', 502);
    }

    const responsePayload = {
      distance_km: route.distanceKm,
      duration_minutes: route.durationMinutes,
      provider: route.provider,
      origin_coordinates: route.originCoordinates,
      destination_coordinates: route.destinationCoordinates,
      origin_precision: route.originPrecision,
      destination_precision: route.destinationPrecision,
      origin_label: route.originLabel,
      destination_label: route.destinationLabel
    };
    await admin.from('distance_route_cache').upsert({
      cache_key: cacheKey,
      response: responsePayload,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    return NextResponse.json(responsePayload);
  } catch (error) {
    warnCaught('Erro capturado:', error);
    return jsonError('Nao foi possivel calcular a distancia.', 500);
  }
}
