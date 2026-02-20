// components/discussions/LinkItemModal.js
// Lets users link existing app items (pins, plans) to a message.

import { Feather } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { Map, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { selectedProjectAtom } from '../../store/atoms';

const ITEM_TYPES = [
  { key: 'pin',  label: 'Tâche / Épingle', Icon: MapPin },
  { key: 'plan', label: 'Plan',             Icon: Map },
];

export default function LinkItemModal({ visible, onClose, onLink }) {
  const [project]           = useAtom(selectedProjectAtom);
  const [activeType, setActiveType] = useState('pin');
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]   = useState('');

  useEffect(() => {
    if (!visible || !project?.id) return;
    load(activeType, '');
  }, [visible, activeType, project?.id]);

  const load = async (type, q) => {
    setLoading(true);
    try {
      let data = [];
      if (type === 'pin') {
        let req = supabase
          .from('pdf_pins')
          .select('id, name, pin_number')
          .eq('project_id', project.id)
          .limit(30);
        if (q) req = req.ilike('name', `%${q}%`);
        const { data: d } = await req;
        data = (d ?? []).map(p => ({ id: p.id, label: `#${p.pin_number} – ${p.name}`, item_type: 'pin' }));
      } else if (type === 'plan') {
        let req = supabase
          .from('plans')
          .select('id, name')
          .eq('project_id', project.id)
          .limit(30);
        if (q) req = req.ilike('name', `%${q}%`);
        const { data: d } = await req;
        data = (d ?? []).map(p => ({ id: p.id, label: p.name, item_type: 'plan' }));
      }
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text) => {
    setQuery(text);
    load(activeType, text);
  };

  const handleSelect = (item) => {
    onLink({ item_type: item.item_type, item_id: item.id, label: item.label });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Lier un élément</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={24} color="#333" /></TouchableOpacity>
          </View>

          {/* Type tabs */}
          <View style={styles.tabs}>
            {ITEM_TYPES.map(({ key, label, Icon }) => (
              <TouchableOpacity
                key={key}
                style={[styles.tab, activeType === key && styles.tabActive]}
                onPress={() => { setActiveType(key); setQuery(''); load(key, ''); }}
              >
                <Icon size={15} color={activeType === key ? '#6D28D9' : '#6B7280'} />
                <Text style={[styles.tabText, activeType === key && styles.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search */}
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher…"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={handleSearch}
            />
          </View>

          {/* Results */}
          {loading ? (
            <ActivityIndicator size="small" color="#6D28D9" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={i => i.id}
              style={{ maxHeight: 280 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)}>
                  <Text style={styles.itemLabel} numberOfLines={2}>{item.label}</Text>
                  <Feather name="plus" size={18} color="#6D28D9" />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={
                <Text style={styles.empty}>Aucun résultat</Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:  { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabActive:     { backgroundColor: '#EDE9FE' },
  tabText:       { fontSize: 13, fontFamily: 'Outfit_500Medium', color: '#6B7280' },
  tabTextActive: { color: '#6D28D9', fontFamily: 'Outfit_600SemiBold' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: 'Outfit_400Regular', color: '#111827' },

  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 4,
  },
  itemLabel: { flex: 1, fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827', marginRight: 12 },
  sep:   { height: 1, backgroundColor: '#F3F4F6' },
  empty: { textAlign: 'center', color: '#9CA3AF', fontFamily: 'Outfit_400Regular', marginTop: 20 },
});