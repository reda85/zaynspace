import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import { MapPinned } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { authHeaders } from '../../../lib/api';
import {
  categoriesAtom,
  loggedInUserAtom,
  selectedProjectAtom,
  statusesAtom,
} from '../../../store/atoms';

const API_URL = 'https://zaynbackend-production.up.railway.app';


// ── Shimmer skeleton (même pattern que les autres écrans) ────────────────────
function SkeletonBox({ width, height, borderRadius = 8, style }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: '#E5E7EB', opacity: anim },
        style,
      ]}
    />
  );
}

function PlanCardSkeleton() {
  return (
    <View style={planSkeletonStyles.card}>
      <View style={planSkeletonStyles.header}>
        <View style={planSkeletonStyles.left}>
          <SkeletonBox width={36} height={36} borderRadius={18} />
          <SkeletonBox width="55%" height={15} borderRadius={4} style={{ marginLeft: 10 }} />
        </View>
        <SkeletonBox width={28} height={13} borderRadius={4} />
      </View>
    </View>
  );
}

function PlansSkeleton() {
  return (
    <View>
      {[0, 1, 2, 3].map(i => <PlanCardSkeleton key={i} />)}
    </View>
  );
}

const planSkeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
});


export default function ProjectPlans() {
  const [selectedProject] = useAtom(selectedProjectAtom);
  const [, setCategories] = useAtom(categoriesAtom);
  const [, setStatuses] = useAtom(statusesAtom);
  const [plans, setPlans] = useState([]);
  const [pinCounts, setPinCounts] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user] = useAtom(loggedInUserAtom);
  const navigation = useNavigation();

  // ── Rename modal ────────────────────────────────────────────────────────────
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [planToRename, setPlanToRename] = useState(null);
  const [newPlanName, setNewPlanName] = useState('');

  // ── Upload modal ────────────────────────────────────────────────────────────
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadState, setUploadState] = useState({
    file: null,         // { name, uri, size, mimeType }
    uploading: false,
    processing: false,
    progress: 0,
    error: null,
    success: false,
    planId: null,
    estimatedTime: '',
    status: null,
  });

  const insets = useSafeAreaInsets();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const realtimeChannelRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // ── Navigation header ───────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: 'Plans',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: '#1A1A1A' },
      headerRight: () => (
        <TouchableOpacity onPress={() => setEditMode((prev) => !prev)}>
          <Text style={styles.headerBtn}>{editMode ? 'Terminé' : 'Modifier'}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, editMode]);

  // ── Animate progress bar ────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: uploadState.progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [uploadState.progress]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  // ── Fetch plans + pin counts ────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProject || !user) return;
    let cancelled = false;

    const fetchPlans = async () => {
      setLoading(true); // ── NEW
      const { data: plansData, error } = await supabase
        .from('plans')
        .select('*')
        .is('deleted_at', null)
        .eq('status', 'ready')
        .eq('project_id', selectedProject.id);

      if (cancelled || error || !plansData) return;
      setPlans(plansData);

      if (plansData.length === 0) return;
      const planIds = plansData.map((p) => p.id);

      let query = supabase.from('pdf_pins').select('plan_id').in('plan_id', planIds);
      if (user.role === 'guest') query = query.eq('assigned_to', user.id);

      const { data: pinsData } = await query;
      if (cancelled || !pinsData) return;

      const counts = {};
      pinsData.forEach((p) => { counts[p.plan_id] = (counts[p.plan_id] || 0) + 1; });
      setPinCounts(counts);
      setLoading(false); // ── NEW
    };

    fetchPlans();
    return () => { cancelled = true; };
  }, [selectedProject, user]);

  // ── Fetch categories & statuses ─────────────────────────────────────────────
  useEffect(() => {
    if (!selectedProject) return;
    let cancelled = false;
    supabase.from('categories').select('*').eq('project_id', selectedProject.id).order('order')
      .then(({ data }) => { if (!cancelled && data) setCategories(data); });
    return () => { cancelled = true; };
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) return;
    let cancelled = false;
    supabase.from('Status').select('*').eq('project_id', selectedProject.id).order('order')
      .then(({ data }) => { if (!cancelled && data) setStatuses(data); });
    return () => { cancelled = true; };
  }, [selectedProject]);

  if (!selectedProject || !user) return null;

  // ── Refresh plans list after processing ─────────────────────────────────────
  const fetchPlansAfterProcessing = async () => {
    const { data } = await supabase
      .from('plans')
      .select('*')
      .eq('project_id', selectedProject.id)
      .is('deleted_at', null)
      .eq('status', 'ready')
      .order('name', { ascending: true });
    if (data) setPlans(data);
  };

  // ── Realtime tracking ───────────────────────────────────────────────────────
  const startRealtimeTracking = (planId) => {
    if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);

    const channel = supabase
      .channel(`plan:${planId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'plans', filter: `id=eq.${planId}` },
        (payload) => {
          const { status, processing_progress } = payload.new;
          setUploadState(prev => ({ ...prev, progress: processing_progress || 0, status }));

          if (status === 'ready') {
            setUploadState(prev => ({ ...prev, processing: false, success: true }));
            fetchPlansAfterProcessing();
            supabase.removeChannel(channel);
          } else if (status === 'failed') {
            setUploadState(prev => ({
              ...prev,
              processing: false,
              error: payload.new.error_message || 'Erreur lors du traitement',
            }));
            supabase.removeChannel(channel);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  // ── Polling fallback ────────────────────────────────────────────────────────
  const startPolling = (planId) => {
    const timeoutId = setTimeout(() => {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`${API_URL}/api/upload-pdf/status/${planId}`, { headers: await authHeaders() });
          const data = await response.json();
          setUploadState(prev => ({ ...prev, progress: data.processing_progress || 0, status: data.status }));

          if (data.status === 'ready' || data.status === 'failed') {
            clearInterval(pollingIntervalRef.current);
            if (data.status === 'ready') {
              setUploadState(prev => ({ ...prev, processing: false, success: true }));
              fetchPlansAfterProcessing();
            } else {
              setUploadState(prev => ({ ...prev, processing: false, error: data.error_message || 'Erreur lors du traitement' }));
            }
          }
        } catch (e) {
          console.error('Polling error:', e);
        }
      }, 3000);
    }, 5000);

    return () => {
      clearTimeout(timeoutId);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  };

  // ── Pick file ───────────────────────────────────────────────────────────────
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];

      // Validate size (100 MB)
      if (asset.size > 100 * 1024 * 1024) {
        setUploadState(prev => ({ ...prev, error: 'La taille du fichier ne doit pas dépasser 100 MB', file: null }));
        setUploadModalVisible(true);
        return;
      }

      setUploadState({
        file: asset,
        uploading: false,
        processing: false,
        progress: 0,
        error: null,
        success: false,
        planId: null,
        estimatedTime: '',
        status: null,
      });
      setUploadModalVisible(true);
    } catch (e) {
      console.error('File pick error:', e);
    }
  };

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadState.file) return;

    setUploadState(prev => ({ ...prev, uploading: true, progress: 0, error: null }));

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: uploadState.file.uri,
        name: uploadState.file.name,
        type: 'application/pdf',
      });
      formData.append('projectId', selectedProject.id);

      const response = await fetch(`${API_URL}/api/upload-pdf`, {
        method: 'POST',
        body: formData,
        headers: await authHeaders({ 'Content-Type': 'multipart/form-data' }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur lors du téléchargement');
      }

      const result = await response.json();

      setUploadState(prev => ({
        ...prev,
        uploading: false,
        processing: true,
        planId: result.planId,
        estimatedTime: result.estimatedTime,
        status: 'processing',
        progress: 0,
      }));

      startRealtimeTracking(result.planId);
      startPolling(result.planId);

    } catch (e) {
      console.error('Upload error:', e);
      setUploadState(prev => ({ ...prev, uploading: false, processing: false, error: e.message }));
    }
  };

  // ── Reset upload state ──────────────────────────────────────────────────────
  const resetUpload = () => {
    if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    setUploadState({ file: null, uploading: false, processing: false, progress: 0, error: null, success: false, planId: null, estimatedTime: '', status: null });
  };

  const closeUploadModal = () => {
    if (uploadState.uploading) return; // block close during upload
    setUploadModalVisible(false);
    setTimeout(resetUpload, 300);
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // ── Rename ──────────────────────────────────────────────────────────────────
  const openRenameModal = (plan) => { setPlanToRename(plan); setNewPlanName(plan.name); setRenameModalVisible(true); };

  const confirmRename = async () => {
    if (!planToRename || !newPlanName.trim()) return;
    const trimmed = newPlanName.trim();
    const { error } = await supabase.from('plans').update({ name: trimmed }).eq('id', planToRename.id);
    if (!error) setPlans(prev => prev.map(p => p.id === planToRename.id ? { ...p, name: trimmed } : p));
    setRenameModalVisible(false);
    setPlanToRename(null);
    setNewPlanName('');
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const deletePlan = (plan) => {
    Alert.alert('Supprimer le plan', `Supprimer "${plan.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await supabase.from('plans').delete().eq('id', plan.id);
          await supabase.storage.from('project-plans').remove([plan.file_url]);
          setPlans(prev => prev.filter(p => p.id !== plan.id));
        },
      },
    ]);
  };

  const filteredPlans = searchTerm
    ? plans.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : plans;

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Feather name="search" size={20} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Rechercher un plan"
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={styles.searchInput}
          placeholderTextColor="#999"
        />
      </View>

      {loading ? (
        <PlansSkeleton />
      ) : (
        <FlatList
        data={filteredPlans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/plans/MainScreen', params: { myuri: item.png_url, myname: item.name, myplanid: item.id } })}
          >
            <View style={styles.cardHeader}>
              <View style={styles.planNameContainer}>
                <View style={styles.pinIconCircle}>
                  <MapPinned size={20} color="#374151" />
                </View>
                <Text style={styles.planName} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
              </View>
              <View style={styles.pinCountContainer}>
                <Feather name="map-pin" size={16} color="#6B7280" />
                <Text style={styles.pinCountText}>{pinCounts[item.id] || 0}</Text>
              </View>
            </View>

            {editMode && (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtnRename} onPress={() => openRenameModal(item)}>
                  <Feather name="edit-2" size={15} color="#111827" />
                  <Text style={styles.actionTextRename}>Renommer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnDelete} onPress={() => deletePlan(item)}>
                  <Feather name="trash" size={15} color="#DC2626" />
                  <Text style={styles.actionTextDelete}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
      )}
      {editMode && (
        <TouchableOpacity style={styles.fab} onPress={pickFile}>
          <Feather name="upload-cloud" size={22} color="white" />
          <Text style={styles.fabText}>Ajouter un plan</Text>
        </TouchableOpacity>
      )}

      {/* ── Upload Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={uploadModalVisible} transparent animationType="slide" onRequestClose={closeUploadModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.uploadModal, { paddingBottom: insets.bottom || 16 }]}>
            {/* Header */}
            <View style={styles.uploadModalHeader}>
              <View>
                <Text style={styles.uploadModalTitle}>Importer un fichier PDF</Text>
                <Text style={styles.uploadModalSubtitle}>Maximum 100 MB</Text>
              </View>
              <TouchableOpacity
                onPress={closeUploadModal}
                disabled={uploadState.uploading}
                style={styles.closeBtn}
              >
                <Feather name="x" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View style={styles.uploadModalBody}>

              {/* File info */}
              {uploadState.file && (
                <View style={styles.fileInfo}>
                  <View style={styles.fileIconBox}>
                    <Feather name="file-text" size={22} color="#374151" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>{uploadState.file.name}</Text>
                    <Text style={styles.fileSize}>{formatFileSize(uploadState.file.size)}</Text>
                  </View>
                  {!uploadState.uploading && !uploadState.processing && !uploadState.success && (
                    <TouchableOpacity onPress={resetUpload}>
                      <Feather name="x" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Uploading indicator */}
              {uploadState.uploading && (
                <View style={styles.progressBlock}>
                  <View style={styles.progressRow}>
                    <ActivityIndicator size="small" color="#6D28D9" />
                    <Text style={styles.progressLabel}>Upload en cours...</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <Animated.View style={[styles.progressFill, { width: '100%', opacity: 0.5 }]} />
                  </View>
                </View>
              )}

              {/* Processing progress */}
              {uploadState.processing && (
                <View style={styles.progressBlock}>
                  <View style={styles.progressRow}>
                    <ActivityIndicator size="small" color="#6D28D9" />
                    <Text style={styles.progressLabel}>Génération des tiles...</Text>
                    <Text style={styles.progressPct}>{uploadState.progress}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <Animated.View
                      style={[styles.progressFill, {
                        width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] })
                      }]}
                    />
                  </View>
                  {uploadState.estimatedTime ? (
                    <View style={styles.estimatedRow}>
                      <Feather name="clock" size={12} color="#9CA3AF" />
                      <Text style={styles.estimatedText}>Temps estimé: {uploadState.estimatedTime}</Text>
                    </View>
                  ) : null}
                  <View style={styles.backgroundNote}>
                    <Text style={styles.backgroundNoteText}>
                      ℹ️ Le traitement continue en arrière-plan. Vous pouvez fermer cette fenêtre.
                    </Text>
                  </View>
                </View>
              )}

              {/* Success */}
              {uploadState.success && (
                <View style={styles.successBox}>
                  <Feather name="check-circle" size={20} color="#16A34A" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.successTitle}>PDF traité avec succès !</Text>
                    <Text style={styles.successBody}>Les pages ont été générées et sont maintenant disponibles.</Text>
                  </View>
                </View>
              )}

              {/* Error */}
              {uploadState.error && (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={20} color="#DC2626" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.errorTitle}>Erreur</Text>
                    <Text style={styles.errorBody}>{uploadState.error}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Footer */}
            <View style={styles.uploadModalFooter}>
              <TouchableOpacity
                style={styles.footerCancelBtn}
                onPress={closeUploadModal}
                disabled={uploadState.uploading}
              >
                <Text style={styles.footerCancelText}>
                  {uploadState.success ? 'Fermer' : uploadState.processing ? 'Fermer (arrière-plan)' : 'Annuler'}
                </Text>
              </TouchableOpacity>

              {uploadState.file && !uploadState.success && !uploadState.error && !uploadState.processing && (
                <TouchableOpacity
                  style={[styles.footerUploadBtn, uploadState.uploading && { opacity: 0.6 }]}
                  onPress={handleUpload}
                  disabled={uploadState.uploading}
                >
                  {uploadState.uploading
                    ? <ActivityIndicator size="small" color="white" />
                    : <Feather name="upload-cloud" size={16} color="white" />
                  }
                  <Text style={styles.footerUploadText}>
                    {uploadState.uploading ? 'Upload...' : 'Télécharger'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Rename Modal ─────────────────────────────────────────────────────── */}
     <Modal
  visible={renameModalVisible}
  transparent
  animationType="fade"
  statusBarTranslucent
  navigationBarTranslucent
  onRequestClose={() => setRenameModalVisible(false)}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={[styles.modalOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}
  >
    <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Renommer le plan</Text>
            <TextInput
              style={styles.modalInput}
              value={newPlanName}
              onChangeText={setNewPlanName}
              placeholder="Nom du plan"
              placeholderTextColor="#999"
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setRenameModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, !newPlanName.trim() && { opacity: 0.4 }]}
                onPress={confirmRename}
                disabled={!newPlanName.trim()}
              >
                <Text style={styles.modalBtnConfirmText}>Renommer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', paddingHorizontal: 16, paddingTop: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 12, marginBottom: 10, height: 44 },
  searchInput: { flex: 1, fontFamily: 'Outfit_400Regular', fontSize: 16, height: '100%', color: '#111827' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5, marginHorizontal: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planNameContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },

  // MapPin icon inside a light grey circle
  pinIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },

  planName: { fontSize: 15, color: '#111827', fontFamily: 'Outfit_500Medium', flex: 1 },
  pinCountContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinCountText: { fontFamily: 'Outfit_400Regular', color: '#4B5563', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },

  // Renommer — grey border / white background / black text
  actionBtnRename: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB' },
  actionTextRename: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: '#111827' },

  // Supprimer — red text on light red/pink background with matching border
  actionBtnDelete: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  actionTextDelete: { fontSize: 13, fontFamily: 'Outfit_500Medium', color: '#DC2626' },

  headerBtn: { color: '#000000', fontFamily: 'Outfit_700Bold', fontSize: 16, marginRight: 16 },

  // Ajouter un plan — black background
  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#000000', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, elevation: 7, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  fabText: { color: 'white', fontFamily: 'Outfit_400Regular', fontSize: 15, marginLeft: 8 },

  // Upload modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  uploadModal: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  uploadModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  uploadModalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 17, color: '#111827' },
  uploadModalSubtitle: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: '#6B7280', marginTop: 2 },
  closeBtn: { padding: 4 },
  uploadModalBody: { padding: 20, gap: 16 },
  fileInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  fileIconBox: { backgroundColor: '#E5E7EB', borderRadius: 8, padding: 10 },
  fileName: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: '#111827' },
  fileSize: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 },
  progressBlock: { gap: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressLabel: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: '#6B7280', flex: 1 },
  progressPct: { fontFamily: 'Outfit_700Bold', fontSize: 13, color: '#111827' },
  progressTrack: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#6D28D9', borderRadius: 99 },
  estimatedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  estimatedText: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: '#9CA3AF' },
  backgroundNote: { backgroundColor: '#F3F4F6', borderRadius: 8, padding: 10 },
  backgroundNoteText: { fontFamily: 'Outfit_400Regular', fontSize: 12, color: '#4B5563', textAlign: 'center' },
  successBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  successTitle: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: '#166534' },
  successBody: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: '#16A34A', marginTop: 2 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#FECACA' },
  errorTitle: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: '#991B1B' },
  errorBody: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: '#DC2626', marginTop: 2 },
  uploadModalFooter: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  footerCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  footerCancelText: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: '#6B7280' },
  footerUploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6D28D9', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  footerUploadText: { fontFamily: 'Outfit_500Medium', fontSize: 14, color: '#FFF' },

  // Rename modal
  modalContainer: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 20, margin: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 17, color: '#1A1A1A', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Outfit_400Regular', fontSize: 15, color: '#111827', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#F3F4F6', alignItems: 'center' },
  modalBtnCancelText: { fontFamily: 'Outfit_500Medium', color: '#6B7280', fontSize: 15 },
  modalBtnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: 'black', alignItems: 'center' },
  modalBtnConfirmText: { fontFamily: 'Outfit_500Medium', color: '#FFFFFF', fontSize: 15 },
});