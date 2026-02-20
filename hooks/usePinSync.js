// hooks/usePinSync.js
import { useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const usePinSync = (planId, onPinsUpdate) => {
  /**
   * Sauvegarder un nouveau pin
   */
  const savePin = useCallback(async (pin) => {
    try {
      const { data, error } = await supabase
        .from('pdf_pins')
        .insert({
          id: pin.id,
          x: pin.x,
          y: pin.y,
          note: pin.note,
          name: pin.name,
          category_id: pin.category_id,
          status_id: pin.status_id,
          project_id: pin.project_id,
          pdf_name: pin.pdf_name,
          plan_id: pin.plan_id,
          due_date: pin.due_date,
          created_at: pin.created_at,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('✅ Pin saved:', data);
      return { success: true, data };
    } catch (error) {
      console.error('❌ Error saving pin:', error);
      return { success: false, error };
    }
  }, []);
  
  /**
   * Mettre à jour un pin existant
   */
  const updatePin = useCallback(async (pinId, updates) => {
    try {
      const { data, error } = await supabase
        .from('pdf_pins')
        .update(updates)
        .eq('id', pinId)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('✅ Pin updated:', data);
      return { success: true, data };
    } catch (error) {
      console.error('❌ Error updating pin:', error);
      return { success: false, error };
    }
  }, []);
  
  /**
   * Supprimer un pin
   */
  const deletePin = useCallback(async (pinId) => {
    try {
      const { error } = await supabase
        .from('pdf_pins')
        .delete()
        .eq('id', pinId);
      
      if (error) throw error;
      
      console.log('✅ Pin deleted:', pinId);
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting pin:', error);
      return { success: false, error };
    }
  }, []);
  
  /**
   * Écouter les changements en temps réel
   */
  useEffect(() => {
    if (!planId) return;
    
    const channel = supabase
      .channel(`pins:${planId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pdf_pins',
          filter: `plan_id=eq.${planId}`
        },
        (payload) => {
          console.log('📡 Pin change detected:', payload);
          
          if (payload.eventType === 'INSERT') {
            onPinsUpdate?.({ type: 'add', pin: payload.new });
          } else if (payload.eventType === 'UPDATE') {
            onPinsUpdate?.({ type: 'update', pin: payload.new });
          } else if (payload.eventType === 'DELETE') {
            onPinsUpdate?.({ type: 'delete', pinId: payload.old.id });
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [planId, onPinsUpdate]);
  
  return { savePin, updatePin, deletePin };
};