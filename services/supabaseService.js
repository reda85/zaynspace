import { supabase } from '../lib/supabase';

// ✅ Create (Add Pin)
export const addPinToSupabase = async (pdfName, pin, userid) => {
  console.log("Add pin to supabase:", pin);
  const {data, error } = await supabase
    .from('pdf_pins')
    .upsert([{ pdf_name: pdfName, ...pin, created_by : userid  }], { onConflict: ['id'] })
    .select('*,projects(*)');
    console.log("Add pin response:", data, error);

  if (error) {
    console.error('Add pin error:', error);
    throw error;
  }
  if (data) {
    console.log('Pin added to Supabase:', data);
    const {data: insertedPin, error: insertError } = await supabase.from('events').insert([
      {
        pin_id: data[0].id,
        category: 'creation',
        event: ' a cree ce pin',
        user_id : userid,
       // pin_photo_id: data.photoUris[0],
     
      },
    ]);

    if (insertError) console.error('Insert event error:', insertError);

    return {
      pin: insertedPin,
      status: 'Pin added to Supabase'
    };
  }
};

// ✅ Read (Load Pins for a PDF)
export const loadPinsFromSupabase = async (planId,user) => {
  if(user.role == 'guest'){
    const { data, error } = await supabase
      .from('pdf_pins')
      .select('*,projects(*),categories(*),Status(*),pins_photos(*),events(*, pins_photos(*), members(*))')
      .eq('plan_id', planId)
      .eq('assigned_to', user.id)

    if (error) {
      console.error('Load pins error:', error);
      throw error;
    }

    return {
      pins: data || [],
      status: 'Pins loaded from Supabase'
    };
  } else {
    const { data, error } = await supabase
      .from('pdf_pins')
      .select('*,projects(*),categories(*),Status(*),pins_photos(*),events(*, pins_photos(*), members(*))')
      .eq('plan_id', planId)

    if (error) {
      console.error('Load pins error:', error);
      throw error;
    }

    return {
      pins: data || [],
      status: 'Pins loaded from Supabase'
    };
  }
};

// ✅ Update (Modify One Pin)
export const updatePinInSupabase = async (pdfName, pin) => {
  console.log("Update pin in supabase:",pin);
  const { error } = await supabase
    .from('pdf_pins')
    .update({due_date: pin.due_date, note: pin.note, name: pin.name, status_id: pin.status_id, category_id: pin.category_id, assigned_to: pin.assigned_to_id,project_id: pin.project_id})
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
