import { Feather } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { ListFilter } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateFilter from '../components/FilterPanel/DateFilter';
import OverdueFilter from '../components/FilterPanel/OverdueFilter';
import StatusFilter from '../components/FilterPanel/StatusFilter';
import { usePinFilters } from '../hooks/usePinFilters';
import { selectedProjectAtom } from '../store/atoms';
import CategoryFilter from './FilterPanel/CategoryFilter';

export default function PdfViewerFilterOverlay({ pins, onFilter, bottomInset = 0, fabOffset = 0, }) {
  const {
    filteredPins,
    searchTerm,
    setSearchTerm,
    overdue,
    setOverdue,
    dateActive,
    setDateActive,
    dateTags,
    setDateTags,
    activeStatuses,
    setActiveStatuses,
    categoryTags,
    setCategoryTags,
    hasActiveFilter,
    clearFilters,
  } = usePinFilters(pins);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom);
  const [categoryActive, setCategoryActive] = useState(false);
  const insets = useSafeAreaInsets();
  // Sync filtered result to parent if needed
  React.useEffect(() => {
    onFilter?.(filteredPins);
  }, [filteredPins]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowFilterPanel(true)}
         style={[
    styles.fab,
    {
       bottom: 40 + insets.bottom + fabOffset,
    },
  ]}
      >
        <ListFilter size={20} color="white" />
        {hasActiveFilter && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{filteredPins.length}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={showFilterPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterPanel(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.filterContainer, { paddingBottom: 16 + bottomInset }]}>
            <View style={styles.header}>
                <View>
                  <Text style={styles.title}>Filtres</Text>
                  <Text style={styles.subtitle}>{filteredPins.length} pins</Text>
                </View>
              <View style={styles.headerRight}>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.clearText}>Effacer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowFilterPanel(false)}>
                  <Feather name="x" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            </View>

         {/*   <TextInput
              placeholder="Rechercher par nom..."
              value={searchTerm}
              onChangeText={setSearchTerm}
              style={styles.searchInput}
            />
            */}

            <OverdueFilter active={overdue} onToggle={setOverdue} />
            <DateFilter
              active={dateActive}
              onToggle={setDateActive}
              tags={dateTags}
              setTags={setDateTags}
            />
            <CategoryFilter
              active={categoryActive}
              onToggle={setCategoryActive}
              tags={categoryTags}
              setTags={setCategoryTags}
            />
            <StatusFilter
              activeStatuses={activeStatuses}
              setActiveStatuses={setActiveStatuses}
              selectedProject={selectedProject}
            />
            
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    // bottom sera ajusté dynamiquement avec bottomInset
    right: 20,
    backgroundColor: 'darkmagenta',
    padding: 16,
    borderRadius: 28,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
  },
  filterBadge: {
     position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: 'green',
        borderRadius: 12,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
  },
  filterBadgeText: {
    color: 'white',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  filterContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    // paddingBottom sera ajusté dynamiquement avec bottomInset
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
 clearText: {
    color: 'darkmagenta',
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    marginRight: 12,
  },
  searchInput: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  subtitle: {
  fontSize: 12,
  color: '#6B7280',
  fontFamily: 'Outfit_400Regular',
  marginTop: 2,
},
});