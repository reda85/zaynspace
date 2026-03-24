// app/discussions/members.js
// Route: /discussions/members?groupId=xxx&groupName=xxx

import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import { UserMinus, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  addMember,
  fetchMembers,
  removeMember,
  searchInvitableUsers,
} from '../../services/discussionsService';
import { loggedInUserAtom, selectedProjectAtom } from '../../store/atoms';

export default function MembersScreen() {
  const navigation                   = useNavigation();
  const { groupId, groupName }       = useLocalSearchParams();
  const [user]                       = useAtom(loggedInUserAtom);
  const [project]                    = useAtom(selectedProjectAtom);
  const [members, setMembers]        = useState([]);
  const [searchQuery, setSearchQuery]= useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading]        = useState(true);
  const [searching, setSearching]    = useState(false);
  const [showSearch, setShowSearch]  = useState(false);
  const [isAdmin, setIsAdmin]        = useState(false);

  // Update isAdmin whenever members change
  // loggedInUserAtom stores members.id as .id but members.auth_id as .auth_id
  // discussions_members.user_id stores auth_id (auth.users.id)
  useEffect(() => {
    const myAuthId = user?.auth_id ?? user?.id;
    const adminStatus = members.find(m => m.user_id === myAuthId)?.role === 'admin';
    setIsAdmin(adminStatus);
  }, [members, user]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Membres',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: 'black' },
      headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
          <View style={styles.headerBtn}><Feather name="arrow-left" size={20} color="#000" /></View>
        </TouchableOpacity>
      ),
      headerRight: () => isAdmin ? (
        <TouchableOpacity 
          onPress={() => {
            console.log('➕ Invite button tapped - toggling showSearch from', showSearch, 'to', !showSearch);
            setShowSearch(v => !v);
          }} 
          style={{ marginRight: 16 }}
        >
          <View style={styles.headerBtnPurple}><UserPlus size={18} color="#FFF" /></View>
        </TouchableOpacity>
      ) : null,
    });
  }, [navigation, isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMembers(groupId);
      setMembers(data);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  // ── Search invitable users ─────────────────────────────────────────────
  useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchInvitableUsers(groupId, project?.id, searchQuery);
        setSearchResults(results);
      } catch (e) {
        console.error('Search error:', e.message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, showSearch, groupId, project?.id]);

  const handleAdd = async (profile) => {
    try {
      await addMember(groupId, profile.auth_id);
      setSearchResults(prev => prev.filter(p => p.auth_id !== profile.auth_id));
      load();
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const handleRemove = (memberId, memberName) => {
    Alert.alert(
      'Retirer le membre',
      `Retirer ${memberName} du groupe ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            await removeMember(groupId, memberId);
            load();
          },
        },
      ]
    );
  };

  const renderMember = ({ item }) => {
    const profile = item.members ?? {};
    const myAuthId = user?.auth_id ?? user?.id;
    const isCurrentUser = item.user_id === myAuthId;
    return (
      <View style={styles.memberRow}>
        <View style={[styles.avatar, { backgroundColor: avatarColor(item.user_id) }]}>
          <Text style={styles.avatarText}>{(profile.name ?? '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.memberName}>{profile.name ?? 'Inconnu'}</Text>
           {item.role === 'admin' && (
  <View style={styles.adminBadge}>
    <Text style={styles.adminBadgeText}>Admin</Text>
  </View>
)}
          </View>
          <Text style={styles.memberEmail}>{profile.email ?? ''}</Text>
        </View>
        {isAdmin && !isCurrentUser && (
          <TouchableOpacity onPress={() => handleRemove(item.user_id, profile.name ?? 'ce membre')}>
            <UserMinus size={18} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderSearchResult = ({ item }) => (
    <View style={styles.memberRow}>
      <View style={[styles.avatar, { backgroundColor: avatarColor(item.auth_id || item.id) }]}>
        <Text style={styles.avatarText}>{(item.name ?? '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>{item.name ?? 'Inconnu'}</Text>
        <Text style={styles.memberEmail}>{item.email ?? ''}</Text>
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={() => handleAdd(item)}>
        <UserPlus size={16} color="#FFF" />
        <Text style={styles.addBtnText}>Inviter</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Invite search panel */}
      {showSearch && (
        <View style={styles.searchPanel}>
            <Text style={styles.sectionLabel}>Inviter un collaborateur</Text>
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher par nom ou email…"
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color="#6D28D9" />}
            </View>
            {searchResults.length > 0 && (
              <FlatList
                data={searchResults}
                keyExtractor={i => i.auth_id || i.id}
                renderItem={renderSearchResult}
                style={{ maxHeight: 220 }}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
              />
            )}
        </View>
      )}

      {/* Members list */}
      <Text style={styles.sectionLabel}>{members.length} membre{members.length !== 1 ? 's' : ''}</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#6D28D9" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={i => i.auth_id || i.id}
          renderItem={renderMember}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const COLORS = ['#7C3AED','#DB2777','#0891B2','#059669','#D97706','#DC2626','#4F46E5'];
const avatarColor = (id) => COLORS[(id ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 16 },

  headerBtn: {
    backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
  },
  headerBtnPurple: {
    backgroundColor: '#6D28D9', width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
  },

  sectionLabel: { fontSize: 12, fontFamily: 'Outfit_600SemiBold', color: '#6B7280', textTransform: 'uppercase', marginBottom: 10 },

  searchPanel: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827' },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#FFF', fontSize: 16, fontFamily: 'Outfit_700Bold' },
  memberInfo: { flex: 1 },
  memberName:  { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#111827' },
  memberEmail: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#6B7280' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#6D28D9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  addBtnText: { color: '#FFF', fontSize: 13, fontFamily: 'Outfit_600SemiBold' },

  sep: { height: 6 },
  adminBadge: {
  backgroundColor: '#EDE9FE',
  borderRadius: 4,
  paddingHorizontal: 6,
  paddingVertical: 2,
},
adminBadgeText: {
  fontSize: 10,
  fontFamily: 'Outfit_600SemiBold',
  color: '#6D28D9',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
},
});