/**
 * components/documents/UploadSheet.js
 */
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform, ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from './UIComponents';

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/*',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export function UploadSheet({ visible, mode, documentName, onClose, onSubmit }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [description, setDescription] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0); // ── NEW
  const insets = useSafeAreaInsets();

  // ── Keyboard listeners ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    const show = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      (e) => setKeyboardOffset(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setKeyboardOffset(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  useEffect(() => {
    if (!visible) setKeyboardOffset(0);
  }, [visible]);

  const reset = () => {
    setSelectedFile(null);
    setDescription('');
    setChangeNotes('');
    setLoading(false);
    setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_TYPES,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', size: asset.size });
        setError(null);
      }
    } catch {
      setError('Impossible de sélectionner le fichier.');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError("Permission d'accès à la galerie requise."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      setSelectedFile({ uri: asset.uri, name: `image_${Date.now()}.${ext}`, mimeType: mime });
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) { setError('Veuillez sélectionner un fichier.'); return; }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        fileUri: selectedFile.uri,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
        description: description.trim() || undefined,
        changeNotes: changeNotes.trim() || undefined,
      });
      handleClose();
    } catch (e) {
      setError(e.message ?? "Échec de l'upload.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 20),
            marginBottom: keyboardOffset,
          }
        ]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {mode === 'new' ? 'Ajouter un document' : 'Nouvelle version'}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Feather name="x" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {mode === 'version' && documentName && (
            <Text style={styles.docNameSub} numberOfLines={1}>{documentName}</Text>
          )}

          <ScrollView
            style={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.inputLabel}>Fichier *</Text>
            {selectedFile ? (
              <View style={styles.selectedFile}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedFileName} numberOfLines={1}>{selectedFile.name}</Text>
                  <Text style={styles.selectedFileMime}>{selectedFile.mimeType}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedFile(null)} style={styles.clearFileBtn}>
                  <Feather name="x" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.pickRow}>
                <TouchableOpacity style={styles.pickBtn} onPress={pickDocument}>
                  <Feather name="file-text" size={22} color={Colors.primary} />
                  <Text style={styles.pickBtnLabel}>Fichier</Text>
                  <Text style={styles.pickBtnSub}>PDF, Word, Excel…</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.pickBtn} onPress={pickImage}>
                  <Feather name="image" size={22} color={Colors.primary} />
                  <Text style={styles.pickBtnLabel}>Photo</Text>
                  <Text style={styles.pickBtnSub}>JPG, PNG…</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'new' && (
              <>
                <Text style={styles.inputLabel}>Description (optionnel)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Décrivez brièvement ce document…"
                  value={description}
                  onChangeText={setDescription}
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </>
            )}

            <Text style={styles.inputLabel}>
              {mode === 'new' ? 'Notes (optionnel)' : 'Modifications apportées'}
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder={mode === 'new' ? 'ex. Première version' : 'ex. Mise à jour section 3…'}
              value={changeNotes}
              onChangeText={setChangeNotes}
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.infoBox}>
              <Feather name="info" size={16} color={Colors.primary} />
              <Text style={styles.infoText}>
                {mode === 'new'
                  ? 'Vous pourrez ajouter de nouvelles versions à tout moment depuis la liste.'
                  : "L'historique complet des versions reste accessible dans l'aperçu du document."}
              </Text>
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={handleClose}
            >
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.submitBtn, (!selectedFile || loading) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!selectedFile || loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.submitBtnText}>
                    {mode === 'new' ? 'Uploader' : 'Enregistrer'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20,
    maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },
  docNameSub: { fontSize: 13, color: Colors.textMuted, fontFamily: 'Outfit_400Regular', marginBottom: 8 },

  form: { marginTop: 16, marginBottom: 8 },

  inputLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: Colors.textSub, marginBottom: 8, marginTop: 16 },
  textInput: {
    backgroundColor: Colors.surfaceInput,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Outfit_400Regular', color: Colors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  pickRow: { flexDirection: 'row', gap: 12 },
  pickBtn: {
    flex: 1, backgroundColor: Colors.surfaceInput,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 16,
    alignItems: 'center', gap: 6,
  },
  pickBtnLabel: { color: Colors.text, fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  pickBtnSub: { color: Colors.textDim, fontSize: 11, fontFamily: 'Outfit_400Regular', textAlign: 'center' },

  selectedFile: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 8, padding: 12, gap: 10,
    borderWidth: 1, borderColor: Colors.primaryBorder,
  },
  selectedFileName: { color: Colors.text, fontSize: 14, fontFamily: 'Outfit_600SemiBold' },
  selectedFileMime: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 2 },
  clearFileBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },

  infoBox: { flexDirection: 'row', backgroundColor: Colors.primaryLight, padding: 12, borderRadius: 8, marginTop: 16, gap: 8 },
  infoText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: Colors.primary, lineHeight: 18 },

  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.errorLight, padding: 12, borderRadius: 8, marginTop: 12, gap: 8 },
  errorText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: Colors.error },

  buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#F3F4F6' },
  cancelBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: Colors.textSub },
  submitBtn: { backgroundColor: Colors.primary },
  submitBtnDisabled: { backgroundColor: '#D1D5DB' },
  submitBtnText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#fff' },
});