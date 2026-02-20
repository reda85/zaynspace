// components/discussions/CreateGroupModal.js

import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { createGroup } from '../../services/discussionsService';

export default function CreateGroupModal({ visible, projectId, onClose, onCreated }) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading]         = useState(false);

  const reset = () => { setName(''); setDescription(''); };

  const handleClose = () => { reset(); onClose(); };

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setLoading(true);
    try {
      const group = await createGroup({ projectId, name, description });
      reset();
      onCreated(group);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Nouveau groupe</Text>
              <TouchableOpacity onPress={handleClose}>
                <Feather name="x" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Nom du groupe *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex : Chantier nord – équipe terrain"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                maxLength={60}
              />

              <Text style={styles.label}>Description (optionnel)</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="De quoi va-t-on discuter ?"
                placeholderTextColor="#9CA3AF"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={200}
              />

              <View style={styles.infoBox}>
                <Feather name="info" size={14} color="#6D28D9" />
                <Text style={styles.infoText}>
                  Vous serez administrateur du groupe et pourrez inviter des membres après la création.
                </Text>
              </View>
            </ScrollView>

            {/* Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createBtn, (!name.trim() || loading) && styles.createBtnDisabled]}
                onPress={handleCreate}
                disabled={!name.trim() || loading}
              >
                {loading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.createText}>Créer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28, maxHeight: '80%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },

  label: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#374151', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827',
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },

  infoBox: {
    flexDirection: 'row', backgroundColor: '#F3E8FF', padding: 12,
    borderRadius: 8, marginTop: 16, gap: 8,
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6D28D9', lineHeight: 18 },

  btnRow:     { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn:  { flex: 1, backgroundColor: '#F3F4F6', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  cancelText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#374151' },
  createBtn:  { flex: 1, backgroundColor: '#6D28D9', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  createBtnDisabled: { backgroundColor: '#D1D5DB' },
  createText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#FFF' },
});