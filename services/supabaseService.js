import { cachedPlanPins, cachedSelect, runOrQueue, withPendingPins } from '../lib/offline';
import { supabase } from '../lib/supabase';

// ✅ Create (Add Pin)
// Sans réseau, la création est mise en file d'attente et envoyée plus tard :
// l'identifiant du pin est généré sur l'appareil, donc rien ne change ensuite.
export const addPinToSupabase = async (pdfName, pin, userid) => {
  const row = { pdf_name: pdfName, ...pin, created_by: userid, updated_at: new Date().toISOString(), updated_by: userid };
  let inserted = null;
  const { queued } = await runOrQueue('pin.insert', { row }, async () => {
    const { data, error } = await supabase
      .from('pdf_pins')
      .upsert([row], { onConflict: ['id'] })
      .select('*,projects(*)');
    if (error) throw error;
    inserted = data?.[0] ?? null;
  });
  return {
    pin: inserted ?? row,
    queued,
    status: queued ? 'Pin en attente d\'envoi' : 'Pin added to Supabase',
  };
};

// ✅ Read (Load Pins for a PDF)
// Hors ligne : dernière liste enregistrée, complétée des modifications en attente.
export const loadPinsFromSupabase = async (planId, user, projectId = null) => {
  const guest = user.role == 'guest';
  const suffix = guest ? `-${user.id}` : '';
  let { data, error, cachedAt, fromCache } = await cachedSelect(`pins-plan-${planId}${suffix}`, () => {
    let query = supabase
      .from('pdf_pins')
      .select('*,projects(*),categories(*),Status(*),pins_photos(*), pin_tags(tag_id, tags(*)),events(*, pins_photos(*), members(*))')
      .is('deleted_at', null)
      .eq('plan_id', planId);
    if (guest) query = query.eq('assigned_to', user.id);
    return query;
  });

  // Hors ligne : la liste de ce plan n'existe que s'il a déjà été ouvert en
  // ligne, et peut être plus ancienne que les listes du projet (accueil,
  // tâches), qui contiennent les pins de tous les plans. On combine les trois.
  if (fromCache) {
    const local = await cachedPlanPins(planId, projectId, suffix);
    if (local) { data = local.pins; cachedAt = local.cachedAt; error = null; }
  }

  if (error && !error.offline) {
    console.error('Load pins error:', error);
    throw error;
  }

  return {
    pins: withPendingPins(data || [], { planId, assignedTo: guest ? user.id : undefined }, cachedAt),
    status: 'Pins loaded from Supabase'
  };
};

// ✅ Update (Modify One Pin)
export const updatePinInSupabase = async (pdfName, pin) => {
  console.log("Update pin in supabase:",pin);
  const { error } = await supabase
    .from('pdf_pins')
    .update({due_date: pin.due_date, note: pin.note, name: pin.name, status_id: pin.status_id, category_id: pin.category_id, assigned_to: pin.assigned_to_id,project_id: pin.project_id, updated_at: new Date().toISOString(), updated_by: pin.updated_by })
    .eq('id', pin.id)
    .eq('pdf_name', pdfName);

  if (error) {
    console.error('Update pin error:', error.message);
    throw error;
  }
};

// ✅ Delete (Remove One Pin)
export const deletePinFromSupabase = async (pdfName, pinId) => {
  const { error } = await supabase
    .from('pins')
    .delete()
    .eq('id', pinId)
    .eq('pdf_name', pdfName);

  if (error) {
    console.error('Delete pin error:', error);
    throw error;
  }
};
