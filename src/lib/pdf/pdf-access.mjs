export class PdfAccessError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PdfAccessError';
    this.status = status;
  }
}

export function getPdfBearerToken(request) {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  if (!match) {
    throw new PdfAccessError(401, 'Authentication is required to generate a PDF.');
  }

  return match[1];
}

export async function requireActivePdfProfile(supabase, accessToken) {
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !authData.user) {
    throw new PdfAccessError(401, 'Authentication is required to generate a PDF.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('auth_user_id', authData.user.id)
    .eq('active', true)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile?.company_id) {
    throw new PdfAccessError(403, 'An active company profile is required to generate a PDF.');
  }

  return {
    userId: String(authData.user.id),
    profileId: String(profile.id),
    companyId: String(profile.company_id),
    role: String(profile.role || '')
  };
}
