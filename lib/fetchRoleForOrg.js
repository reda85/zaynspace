import { cachedSelect, readCache } from './offline';
import { supabase } from './supabase';

export async function fetchRoleForOrg(
  memberId,
  organizationId,
  { cacheOnly = false } = {}
) {
  if (cacheOnly) {
    const cached = await readCache(`role-${memberId}-${organizationId}`);
    return cached?.role ?? null;
  }
  const { data, error } = await cachedSelect(`role-${memberId}-${organizationId}`, () => supabase
    .from('members_organizations')
    .select('role')
    .eq('member_id', memberId)
    .eq('organization_id', organizationId)
    .maybeSingle());

  if (error) {
    console.error('[fetchRoleForOrg] error:', error);
    return null;
  }
  return data?.role ?? null;
}