import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import { MapPinned } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
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
import { WebView } from 'react-native-webview';
import { supabase } from '../../../lib/supabase';
import {
  categoriesAtom,
  loggedInUserAtom,
  selectedProjectAtom,
  statusesAtom,
} from '../../../store/atoms';

export default function ProjectPlans() {
  // ── all hooks first, unconditionally ──────────────────────────────────────
  const [selectedProject] = useAtom(selectedProjectAtom);
  const [, setCategories] = useAtom(categoriesAtom);
  const [, setStatuses] = useAtom(statusesAtom);
  const [plans, setPlans] = useState([]);
  const [pinCounts, setPinCounts] = useState({});
  const [viewUrl, setViewUrl] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [user] = useAtom(loggedInUserAtom);
  const navigation = useNavigation();

  // ── Rename modal state ─────────────────────────────────────────────────────
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [planToRename, setPlanToRename] = useState(null);
  const [newPlanName, setNewPlanName] = useState('');

  useEffect(() => {
    navigation.setOptions({
      title: 'Plans',
      headerTitleAlign: 'center',
      headerTitleStyle: {
        fontFamily: 'Outfit_700Bold',
        fontSize: 24,
        color: '#1A1A1A',
      },
      headerRight: () => (
        <TouchableOpacity onPress={() => setEditMode((prev) => !prev)}>
          <Text style={styles.headerBtn}>
            {editMode ? 'Terminé' : 'Modifier'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, editMode]);

  useEffect(() => {
    const project = selectedProject;
    const currentUser = user;
    if (!project || !currentUser) return;

    let cancelled = false;

    const fetchPlans = async () => {
      const { data: plansData, error } = await supabase
        .from('plans')
        .select('*')
        .eq('project_id', project.id);

      if (cancelled || error || !plansData) return;
      setPlans(plansData);

      if (plansData.length === 0) return;

      const planIds = plansData.map((p) => p.id);

      let query = supabase.from('pdf_pins').select('plan_id').in('plan_id', planIds);
      if (currentUser.role === 'guest') {
        query = query.eq('assigned_to', currentUser.id);
      }

      const { data: pinsData, error: pinsError } = await query;
      if (pinsError) console.error('Error fetching pins data:', pinsError);
      if (cancelled || !pinsData) return;

      const counts = {};
      pinsData.forEach((p) => {
        counts[p.plan_id] = (counts[p.plan_id] || 0) + 1;
      });
      setPinCounts(counts);
    };

    fetchPlans();
    return () => { cancelled = true; };
  }, [selectedProject, user]);

  useEffect(() => {
    const project = selectedProject;
    if (!project) return;
    let cancelled = false;

    supabase
      .from('categories')
      .select('*')
      .eq('project_id', project.id)
      .order('order')
      .then(({ data }) => {
        if (!cancelled && data) setCategories(data);
      });

    return () => { cancelled = true; };
  }, [selectedProject]);

  useEffect(() => {
    const project = selectedProject;
    if (!project) return;
    let cancelled = false;

    supabase
      .from('Status')
      .select('*')
      .eq('project_id', project.id)
      .order('order')
      .then(({ data }) => {
        if (!cancelled && data) {
          setStatuses(data);
          console.log('Fetched statuses:', data);
        }
      });

    return () => { cancelled = true; };
  }, [selectedProject]);

  // ── early return AFTER all hooks ─────────────────────────────────────────
  if (!selectedProject || !user) return null;

  // ── handlers ──────────────────────────────────────────────────────────────
  const uploadPDF = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.type === 'success') {
      const file = await fetch(result.uri);
      const blob = await file.blob();
      const filePath = `${selectedProject.id}/${Date.now()}-${result.name}`;
      const { error } = await supabase.storage.from('project-plans').upload(filePath, blob);
      if (!error) {
        await supabase.from('plans').insert({
          name: result.name.replace('.pdf', ''),
          project_id: selectedProject.id,
          file_url: filePath,
        });
      }
    }
  };

  const deletePlan = (plan) => {
    Alert.alert('Supprimer le plan', `Supprimer "${plan.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('plans').delete().eq('id', plan.id);
          await supabase.storage.from('project-plans').remove([plan.file_url]);
          setPlans((prev) => prev.filter((p) => p.id !== plan.id));
        },
      },
    ]);
  };

  const openRenameModal = (plan) => {
    setPlanToRename(plan);
    setNewPlanName(plan.name);
    setRenameModalVisible(true);
  };

  const confirmRename = async () => {
    if (!planToRename || !newPlanName.trim()) return;
    const trimmed = newPlanName.trim();

    const { error } = await supabase
      .from('plans')
      .update({ name: trimmed })
      .eq('id', planToRename.id);

    if (!error) {
      setPlans((prev) =>
        prev.map((p) => (p.id === planToRename.id ? { ...p, name: trimmed } : p))
      );
    }

    setRenameModalVisible(false);
    setPlanToRename(null);
    setNewPlanName('');
  };

  if (viewUrl) {
    return (
      <WebView
        source={{ uri: viewUrl }}
        style={{ flex: 1 }}
        onError={() => setViewUrl(null)}
      />
    );
  }

  const filteredPlans = searchTerm
    ? plans.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
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

      <FlatList
        data={filteredPlans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/plans/MainScreen',
                params: {
                  myuri: item.png_url,
                  myname: item.name,
                  myplanid: item.id,
                },
              })
            }
          >
            <View style={styles.cardHeader}>
              <View style={styles.planNameContainer}>
                <MapPinned size={20} color="#6D28D9" />
                <Text style={styles.planName} numberOfLines={2} ellipsizeMode="tail">
                  {item.name}
                </Text>
              </View>
              <View style={styles.pinCountContainer}>
                <Feather name="map-pin" size={16} color="#6B7280" />
                <Text style={styles.pinCountText}>{pinCounts[item.id] || 0}</Text>
              </View>
            </View>

            {editMode && (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtnRename} onPress={() => openRenameModal(item)}>
                  <Feather name="edit-2" size={15} color="#6D28D9" />
                  <Text style={styles.actionTextRename}>Renommer</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionBtnDelete} onPress={() => deletePlan(item)}>
                  <Feather name="trash" size={15} color="#6D28D9" />
                  <Text style={styles.actionTextDelete}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      {editMode && (
        <TouchableOpacity style={styles.fab} onPress={uploadPDF}>
          <Feather name="upload-cloud" size={22} color="white" />
          <Text style={styles.fabText}>Ajouter un plan</Text>
        </TouchableOpacity>
      )}

      {/* Rename Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
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
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setRenameModalVisible(false)}
              >
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
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Outfit_400Regular',
    fontSize: 16,
    height: '100%',
    color: '#111827',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 5,
    marginHorizontal: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  planNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,        // takes available space, preventing overflow
    marginRight: 8, // keeps gap from pin count badge
  },
  planName: {
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Outfit_500Medium',
    flex: 1, // constrains text within the row
  },
  pinCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinCountText: {
    fontFamily: 'Outfit_400Regular',
    color: '#4B5563',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtnRename: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
  },
  actionTextRename: {
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
    color: '#6D28D9',
  },
  actionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EDE9FE',
  },
  actionTextDelete: {
    fontSize: 13,
    fontFamily: 'Outfit_500Medium',
    color: '#6D28D9',
  },
  headerBtn: {
    color: '#000000',
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    marginRight: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6D28D9',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  fabText: {
    color: 'white',
    fontFamily: 'Outfit_400Regular',
    fontSize: 15,
    marginLeft: 8,
  },

  // ── Rename Modal ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    color: '#1A1A1A',
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Outfit_400Regular',
    fontSize: 15,
    color: '#111827',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontFamily: 'Outfit_500Medium',
    color: '#6B7280',
    fontSize: 15,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontFamily: 'Outfit_500Medium',
    color: '#FFFFFF',
    fontSize: 15,
  },
});