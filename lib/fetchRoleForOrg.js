import { supabase } from './supabase';

export async function fetchRoleForOrg(
  memberId,
  organizationId
) {
  const { data, error } = await supabase
    .from('members_organizations')
    .select('role')
    .eq('member_id', memberId)
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    console.error('[fetchRoleForOrg] error:', error);
    return null;
  }
  return data?.role ?? null;
}