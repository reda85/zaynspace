import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useNavigation } from 'expo-router';
import { useAtom, useSetAtom } from 'jotai';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  X,
} from 'lucide-react-native';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRoleForOrg } from '../lib/fetchRoleForOrg';
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

  const [user, setLoggedInUser] = useAtom(loggedInUserAtom);
  const [selectedOrg, setSelectedOrg] = useAtom(selectedOrganizationAtom);

  // Reset atoms on org switch (same as AuthGate SIGNED_OUT reset)
  const setPlans      = useSetAtom(plansAtom);
  const setPins       = useSetAtom(pinsAtom);
  const setCategories = useSetAtom(categoriesAtom);
  const setStatuses   = useSetAtom(statusesAtom);
  const setMembers    = useSetAtom(membersAtom);
  const [, setSelectedProject] = useAtom(selectedProjectAtom);

  const [projects, setProjects]       = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const [orgs, setOrgs]               = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgModalVisible, setOrgModalVisible] = useState(false);

  // The org currently being displayed (may differ from selectedOrg mid-switch)
  const activeOrgId = selectedOrg?.id ?? user?.organization_id;

  /* ─── load organizations this member belongs to ─── */
  const fetchOrgs = async () => {
    setLoadingOrgs(true);
    const { data, error } = await supabase
      .from('members_organizations')
      .select('organization_id, organizations(id, name)')
      .eq('member_id', user.id);

    if (error) console.error('Error loading orgs:', error);
    else setOrgs(data.map((row) => row.organizations));
    setLoadingOrgs(false);
  };

  /* ─── load projects for the active org ─── */
 /* ─── load projects for the active org where user is a member ─── */
const fetchProjects = async (orgId) => {
  setLoadingProjects(true);
  
  try {
    // First get all project IDs where this user is a member
    const { data: memberProjects, error: memberError } = await supabase
      .from('members_projects')
      .select('project_id')
      .eq('member_id', user.id);

    if (memberError) throw memberError;

    const projectIds = memberProjects?.map(mp => mp.project_id) ?? [];

    if (projectIds.length === 0) {
      // User is not a member of any projects
      setProjects([]);
      setLoadingProjects(false);
      return;
    }

    // Then fetch full project details for those IDs + org filter
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('organization_id', orgId)
      .in('id', projectIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setProjects(data ?? []);
  } catch (error) {
    console.error('Error loading projects:', error);
    setProjects([]);
  } finally {
    setLoadingProjects(false);
  }
};

  useEffect(() => {
    fetchOrgs();
  }, []);

  useEffect(() => {
    if (activeOrgId) fetchProjects(activeOrgId);
  }, [activeOrgId]);

  /* ─── switch org ─── */
  const handleOrgSelect = async (org) => {
  setOrgModalVisible(false);
  if (org.id === activeOrgId) return;

  // 1. Persist new org
  await AsyncStorage.setItem('last_organization_id', org.id.toString());

  // 2. Fetch role for the new org
  const role = await fetchRoleForOrg(user.id, org.id);

  // 3. Reset all org-scoped atoms
  setPlans([]);
  setPins([]);
  setCategories([]);
  setStatuses([]);
  setMembers([]);
  setSelectedProject(null);

  // 4. Update atoms — role is now org-specific
  setLoggedInUser((prev) => ({ ...prev, organization_id: org.id, role }));
  setSelectedOrg(org);
};

  /* ─── select project ─── */
  const handleSelectProject = async (project) => {
    await AsyncStorage.setItem('last_project_id', project.id.toString());
    setSelectedProject(project);
    router.back();
  };

  /* ─── header ─── */
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
            fetchOrgs();          // refresh list each time modal opens
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
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginLeft: 16 }}
        >
          <View style={styles.closeButton}>
            <X size={24} color="#000" />
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation, activeOrgName, orgs]);

  /* ─── render ─── */
  return (
    <SafeAreaView style={styles.container}>
      {/* ── Project list ── */}
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
                Créez votre premier projet pour commencer
              </Text>
            </View>
          }
        />
      )}

      {/* ── Org picker modal ── */}
      <Modal
        visible={orgModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOrgModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOrgModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Changer d'organisation</Text>

                {loadingOrgs ? (
                  <ActivityIndicator
                    size="small"
                    color="#111827"
                    style={{ marginVertical: 24 }}
                  />
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
                          <View
                            style={[
                              styles.orgIcon,
                              isActive && styles.orgIconActive,
                            ]}
                          >
                            <Building2
                              size={18}
                              color={isActive ? '#fff' : '#6B7280'}
                            />
                          </View>
                          <Text
                            style={[
                              styles.orgItemText,
                              isActive && styles.orgItemTextActive,
                            ]}
                          >
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
    </SafeAreaView>
  );
}

/* ─────────────────── STYLES ─────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },

  /* Header org picker */
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

  /* Loading */
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    color: '#6B7280',
  },

  /* List */
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
  projectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectText: { flex: 1, gap: 4 },
  projectTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: '#111827',
  },
  projectSubtitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  /* Empty */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: '#111827',
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  /* Org modal */
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
    paddingBottom: 36,
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
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#111827',
    marginBottom: 8,
  },

  orgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  orgItemActive: {
    backgroundColor: '#F3F4F6',
  },
  orgItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orgIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgIconActive: {
    backgroundColor: '#111827',
  },
  orgItemText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 15,
    color: '#374151',
  },
  orgItemTextActive: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#111827',
  },
});