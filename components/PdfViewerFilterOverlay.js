import { Feather } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { ChevronLeft, Layers, ListFilter } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssignedToFilter from '../components/FilterPanel/AssignedToFilter';
import DateFilter from '../components/FilterPanel/DateFilter';
import OverdueFilter from '../components/FilterPanel/OverdueFilter';
import StatusFilter from '../components/FilterPanel/StatusFilter';
import { usePinFilters } from '../hooks/usePinFilters';
import { C, F } from '../constants/theme';
import { selectedProjectAtom, statusesAtom } from '../store/atoms';
import ArchivedFilter from './FilterPanel/ArchivedFilter';
import CategoryFilter from './FilterPanel/CategoryFilter';
import TagFilter from './FilterPanel/TagFilter';

// Barre flottante en haut du plan : retour, nom du plan et nombre de pins
// affichés, bouton des filtres, puis les filtres actifs en étiquettes.
export default function PdfViewerFilterOverlay({ pins, onFilter, planName, onBack }) {
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
    categoryActive,
    setCategoryActive,
    categoryTags,
    setCategoryTags,
    tagActive,
    setTagActive,
    tagIds,
    setTagIds,
    assignedToActive,
    setAssignedToActive,
    selectedAssignees,
    setSelectedAssignees,
    hasActiveFilter,
    clearFilters,
    showArchived,
    setShowArchived,
  } = usePinFilters(pins);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedProject] = useAtom(selectedProjectAtom);
  const [statuses] = useAtom(statusesAtom);
  const insets = useSafeAreaInsets();

  const chips = useMemo(() => {
    const out = [];
    for (const id of activeStatuses) {
      const st = statuses?.find((x) => x.id === id);
      if (st) out.push(st.name);
    }
    if (overdue) out.push('En retard');
    if (categoryActive) out.push(...(categoryTags.length ? categoryTags : ['Aucune catégorie']));
    if (dateActive) out.push('Date');
    if (tagActive) out.push(tagIds.length > 1 ? `${tagIds.length} tags` : 'Tag');
    if (assignedToActive) out.push(selectedAssignees.length > 1 ? `${selectedAssignees.length} intervenants` : 'Intervenant');
    if (showArchived) out.push('Archivés inclus');
    if (searchTerm) out.push(`« ${searchTerm} »`);
    return out;
  }, [activeStatuses, statuses, overdue, categoryActive, categoryTags, dateActive, tagActive, tagIds,
      assignedToActive, selectedAssignees, showArchived, searchTerm]);

  React.useEffect(() => {
    onFilter?.(filteredPins);
  }, [filteredPins]);

  return (
    <>
      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.square} accessibilityLabel="Retour aux plans">
              <ChevronLeft size={22} color={C.encre} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.planCard}>
            <Layers size={18} color={C.mine} strokeWidth={1.8} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.planName} numberOfLines={1}>{planName || 'Plan'}</Text>
              <Text style={styles.planMeta} numberOfLines={1}>
                {filteredPins.length} pin{filteredPins.length > 1 ? 's' : ''} affiché{filteredPins.length > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowFilterPanel(true)}
            style={styles.square}
            accessibilityLabel="Filtrer les pins"
          >
            <ListFilter size={20} color={C.encre} strokeWidth={1.8} />
            {hasActiveFilter && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{chips.length || 1}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        {chips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {chips.map((label, i) => (
              <TouchableOpacity
                key={`${label}-${i}`}
                onPress={() => setShowFilterPanel(true)}
                style={[styles.chip, i === 0 && styles.chipDark]}
              >
                <Text style={[styles.chipText, i === 0 && { color: C.blanc }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Filter panel modal */}
      <Modal
        visible={showFilterPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterPanel(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterContainer}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Filtres</Text>
                <Text style={styles.subtitle}>{filteredPins.length} pins</Text>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.clearText}>Effacer</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowFilterPanel(false)} style={{ marginLeft: 12 }}>
                  <Feather name="x" size={20} color="#000" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, 16) },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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
              <TagFilter
                active={tagActive}
                onToggle={setTagActive}
                selectedTags={tagIds}
                setSelectedTags={setTagIds}
              />
              <AssignedToFilter
                active={assignedToActive}
                onToggle={setAssignedToActive}
                selectedMembers={selectedAssignees}
                setSelectedMembers={setSelectedAssignees}
              />
              <StatusFilter
                activeStatuses={activeStatuses}
                setActiveStatuses={setActiveStatuses}
                selectedProject={selectedProject}
              />
              <ArchivedFilter active={showArchived} onToggle={setShowArchived} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 16, right: 16, zIndex: 1000, elevation: 10, gap: 8 },
  topRow: { flexDirection: 'row', gap: 8 },
  square: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: C.blanc,
    borderWidth: 1, borderColor: C.filet, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1C1A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  planCard: {
    flex: 1, minWidth: 0, height: 48, borderRadius: 14, backgroundColor: C.blanc,
    borderWidth: 1, borderColor: C.filet, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
    shadowColor: '#1C1C1A', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  planName: { fontFamily: F.semibold, fontSize: 15, color: C.encre },
  planMeta: { fontFamily: F.regular, fontSize: 12, color: C.mineClair },
  chips: { gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: C.blanc, borderWidth: 1, borderColor: C.filet,
  },
  chipDark: { backgroundColor: C.encre, borderColor: C.encre },
  chipText: { fontFamily: F.medium, fontSize: 12, color: C.mine },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: C.tirage,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: C.blanc,
    fontSize: 10,
    fontFamily: F.semibold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  filterContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  scrollContent: {
    paddingTop: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    color: '#1C1C1A',
  },
  subtitle: {
    fontSize: 12,
    color: '#5B5B56',
    fontFamily: 'Outfit_400Regular',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearText: {
    color: C.tirage,
    fontSize: 14,
    fontFamily: 'Outfit_400Regular',
    marginRight: 12,
  },
});