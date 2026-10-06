import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useNavigation } from 'expo-router';
import { useAtom, useSetAtom } from 'jotai';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  X,
} from 'lucide-react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchRoleForOrg } from '../lib/fetchRoleForOrg';
import { cachedSelect } from '../lib/offline';
import { supabase } from '../lib/supabase';
import {
  categoriesAtom,
  loggedInUserAtom,
  membersAtom,
  pinsAtom,
  plansAtom,
  selectedOrganizationAtom,
  selectedProjectAtom,
  statusesAtom,
} from '../store/atoms';

export default function SelectProjectScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [user, setLoggedInUser] = useAtom(loggedInUserAtom);
  const [selectedOrg, setSelectedOrg] = useAtom(selectedOrganizationAtom);

  const setPlans      = useSetAtom(plansAtom);
  const setPins       = useSetAtom(pinsAtom);
  const setCategories = useSetAtom(categoriesAtom);
  const setStatuses   = useSetAtom(statusesAtom);
  const setMembers    = useSetAtom(membersAtom);
  const [, setSelectedProject] = useAtom(selectedProjectAtom);

  const [projects, setProjects]               = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [orgs, setOrgs]               = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgModalVisible, setOrgModalVisible] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newProjectName, setNewProjectName]           = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creating, setCreating]                       = useState(false);
  const [createError, setCreateError]                 = useState('');
  const nameInputRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const activeOrgId = selectedOrg?.id ?? user?.organization_id;

  const fetchOrgs = async () => {
    setLoadingOrgs(true);
    const { data, error } = await cachedSelect(`orgs-${user.id}`, () => supabase
      .from('members_organizations')
      .select('organization_id, organizations(id, name)')
      .eq('member_id', user.id));

    if (error) console.error('Error loading orgs:', error);
    else setOrgs(data.map((row) => row.organizations));
    setLoadingOrgs(false);
  };

  const fetchProjects = async (orgId) => {
    setLoadingProjects(true);
    try {
      const { data: memberProjects, error: memberError } = await cachedSelect(`my-project-ids-${user.id}`, () => supabase
        .from('members_projects')
        .select('project_id')
        .eq('member_id', user.id));

      if (memberError) throw memberError;

      const projectIds = memberProjects?.map((mp) => mp.project_id) ?? [];

      if (projectIds.length === 0) {
        setProjects([]);
        setLoadingProjects(false);
        return;
      }

      const { data, error } = await cachedSelect(`projects-${orgId}-${user.id}`, () => supabase
        .from('projects')
        .select('*')
        .eq('organization_id', orgId)
        .in('id', projectIds)
        .order('created_at', { ascending: false }));

      if (error) throw error;
      setProjects(data ?? []);
    } catch (err) {
      console.error('Error loading projects:', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => { fetchOrgs(); }, []);
  useEffect(() => { if (activeOrgId) fetchProjects(activeOrgId); }, [activeOrgId]);

  const handleOrgSelect = async (org) => {
  setOrgModalVisible(false);
  if (org.id === activeOrgId) return;

  await AsyncStorage.setItem(`last_organization_id_${user.id}`, org.id.toString());
  const role = await fetchRoleForOrg(user.id, org.id);

  setPlans([]);
  setPins([]);
  setCategories([]);
  setStatuses([]);
  setMembers([]);

  setLoggedInUser((prev) => ({ ...prev, organization_id: org.id, role }));
  setSelectedOrg(org);

  // ── Sélectionne automatiquement le premier projet de la nouvelle org ──
  try {
    const { data: memberProjects, error: memberError } = await cachedSelect(`my-project-ids-${user.id}`, () => supabase
      .from('members_projects')
      .select('project_id')
      .eq('member_id', user.id));

    if (memberError) throw memberError;

    const projectIds = memberProjects?.map((mp) => mp.project_id) ?? [];

    if (projectIds.length === 0) {
      setSelectedProject(null);
      return;
    }

    const { data: orgProjects, error: projectsError } = await cachedSelect(`projects-${org.id}-${user.id}`, () => supabase
      .from('projects')
      .select('*')
      .eq('organization_id', org.id)
      .in('id', projectIds)
      .order('created_at', { ascending: false }));

    if (projectsError) throw projectsError;

    const firstProject = orgProjects?.[0] ?? null;
    setSelectedProject(firstProject);
    if (firstProject) {
      await AsyncStorage.setItem('last_project_id', String(firstProject.id));
    }
  } catch (err) {
    console.error('Error auto-selecting first project:', err);
    setSelectedProject(null);
  }
};

  const handleSelectProject = async (project) => {
    await AsyncStorage.setItem('last_project_id', project.id.toString());
    setSelectedProject(project);
    router.back();
  };

  const openCreateModal = () => {
    setNewProjectName('');
    setNewProjectDescription('');
    setCreateError('');
    setCreateModalVisible(true);
    setTimeout(() => nameInputRef.current?.focus(), 300);
  };

  const closeCreateModal = () => {
    Keyboard.dismiss();
    setCreateModalVisible(false);
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setCreateError('Le nom du projet est requis.');
      return;
    }
    setCreateError('');
    setCreating(true);

    try {
      const { data, error } = await supabase.rpc('create_project_with_defaults', {
        p_name: name,
        p_organization_id: activeOrgId,
      });

      if (error) throw error;

      await fetchProjects(activeOrgId);
      closeCreateModal();
    } catch (err) {
      console.error('Error creating project:', err);
      setCreateError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setCreating(false);
    }
  };

  const activeOrgName =
    selectedOrg?.name ??
    orgs.find((o) => o.id === user?.organization_id)?.name ??
    'Organisation';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <TouchableOpacity
          style={styles.orgPicker}
          onPress={() => {
            fetchOrgs();
            setOrgModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Building2 size={16} color="#111827" />
          <Text style={styles.orgPickerText} numberOfLines={1}>
            {activeOrgName}
          </Text>
          <ChevronDown size={16} color="#6B7280" />
        </TouchableOpacity>
      ),
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerStyle: { backgroundColor: '#F5F7FA' },
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} >
          <View style={styles.closeButton}>
            <X size={24} color="#000" />
          </View>
        </TouchableOpacity>
      ),
      headerRight: () =>
        isAdmin ? (
          <TouchableOpacity onPress={openCreateModal} >
            <View style={styles.addButton}>
              <Plus size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, activeOrgName, orgs, isAdmin]);

  return (
    <SafeAreaView style={styles.container}>
      {loadingProjects ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
          <Text style={styles.loadingText}>Chargement des projets...</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.projectItem}
                onPress={() => handleSelectProject(item)}
                activeOpacity={0.7}
              >
                <View style={styles.projectLeft}>
                  <View style={styles.iconContainer}>
                    <FolderOpen size={20} color="#6B7280" />
                  </View>
                  <View style={styles.projectText}>
                    <Text style={styles.projectTitle}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.projectSubtitle} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <ChevronRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FolderOpen size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>Aucun projet</Text>
              <Text style={styles.emptySubtitle}>
                {isAdmin
                  ? 'Appuyez sur + pour créer votre premier projet'
                  : 'Aucun projet ne vous a été assigné pour le moment'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Organisation picker modal ── */}
      <Modal
        visible={orgModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOrgModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOrgModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Changer d'organisation</Text>

                {loadingOrgs ? (
                  <ActivityIndicator size="small" color="#111827" style={{ marginVertical: 24 }} />
                ) : (
                  orgs.map((org) => {
                    const isActive = org.id === activeOrgId;
                    return (
                      <TouchableOpacity
                        key={org.id}
                        style={[styles.orgItem, isActive && styles.orgItemActive]}
                        onPress={() => handleOrgSelect(org)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.orgItemLeft}>
                          <View style={[styles.orgIcon, isActive && styles.orgIconActive]}>
                            <Building2 size={18} color={isActive ? '#fff' : '#6B7280'} />
                          </View>
                          <Text style={[styles.orgItemText, isActive && styles.orgItemTextActive]}>
                            {org.name}
                          </Text>
                        </View>
                        {isActive && <Check size={18} color="#111827" />}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── Create Project modal — admin only ── */}
      {isAdmin && (
        <Modal
          visible={createModalVisible}
          transparent
          animationType="slide"
          onRequestClose={closeCreateModal}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableWithoutFeedback onPress={closeCreateModal}>
              <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback>
                  <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                    <View style={styles.modalHandle} />

                    <View style={styles.createModalHeader}>
                      <Text style={styles.modalTitle}>Nouveau projet</Text>
                      <TouchableOpacity onPress={closeCreateModal} hitSlop={8}>
                        <X size={20} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Nom du projet *</Text>
                      <TextInput
                        ref={nameInputRef}
                        style={[styles.textInput, createError && newProjectName.trim() === '' && styles.textInputError]}
                        placeholder="Ex: Résidence Al Amal"
                        placeholderTextColor="#9CA3AF"
                        value={newProjectName}
                        onChangeText={(t) => {
                          setNewProjectName(t);
                          if (createError) setCreateError('');
                        }}
                        returnKeyType="next"
                        maxLength={100}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Description (optionnel)</Text>
                      <TextInput
                        style={[styles.textInput, styles.textArea]}
                        placeholder="Décrivez brièvement le projet..."
                        placeholderTextColor="#9CA3AF"
                        value={newProjectDescription}
                        onChangeText={setNewProjectDescription}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                        maxLength={300}
                      />
                    </View>

                    {createError ? (
                      <Text style={styles.errorText}>{createError}</Text>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.createButton, creating && styles.createButtonDisabled]}
                      onPress={handleCreateProject}
                      activeOpacity={0.8}
                      disabled={creating}
                    >
                      {creating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Plus size={18} color="#fff" />
                          <Text style={styles.createButtonText}>Créer le projet</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  orgPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxWidth: 220,
  },
  orgPickerText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#111827',
    flexShrink: 1,
  },

  closeButton: {
    backgroundColor: 'white',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 2,
  },

  addButton: {
    backgroundColor: '#111827',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontFamily: 'Outfit_500Medium', fontSize: 16, color: '#6B7280' },

  listContent: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  projectLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectText: { flex: 1, gap: 4 },
  projectTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 16, color: '#111827' },
  projectSubtitle: { fontFamily: 'Outfit_400Regular', fontSize: 14, color: '#6B7280', lineHeight: 20 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontFamily: 'Outfit_600SemiBold', fontSize: 18, color: '#111827', marginTop: 8 },
  emptySubtitle: { fontFamily: 'Outfit_400Regular', fontSize: 14, color: '#6B7280', textAlign: 'center' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: '#111827', marginBottom: 8 },

  orgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  orgItemActive: { backgroundColor: '#F3F4F6' },
  orgItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orgIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgIconActive: { backgroundColor: '#111827' },
  orgItemText: { fontFamily: 'Outfit_500Medium', fontSize: 15, color: '#374151' },
  orgItemTextActive: { fontFamily: 'Outfit_600SemiBold', color: '#111827' },

  createModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fieldGroup: { gap: 6, marginTop: 8 },
  fieldLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: '#374151',
    letterSpacing: 0.2,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Outfit_400Regular',
    fontSize: 15,
    color: '#111827',
  },
  textInputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  errorText: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 13,
    color: '#EF4444',
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  createButtonDisabled: { opacity: 0.6 },
  createButtonText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
});