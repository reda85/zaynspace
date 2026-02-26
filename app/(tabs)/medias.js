import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { useNavigation } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useAtom } from 'jotai';
import { Eye, ListFilter, MousePointer, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Modal, ScrollView, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ImageViewerModal from '../../components/ImageViewerModal';
import { supabase } from '../../lib/supabase';
import { selectedProjectAtom } from '../../store/atoms';

const IMAGE_SIZE = Dimensions.get('window').width / 3 - 16;

export default function MediaGalleryScreen() {
  const [project] = useAtom(selectedProjectAtom);
  const [media, setMedia] = useState([]);
  const [groupedMedia, setGroupedMedia] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Filter states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  const navigation = useNavigation();

  const toggleMode = useCallback(() => {
    setSelectionMode(prev => !prev);
    setSelectedIds(new Set());
  }, []);

  useEffect(() => {
    navigation.setOptions({
      headerTitleAlign: 'center',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
          <View style={styles.headerButton}>
            <Feather name="arrow-left" size={20} color="#000" />
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={toggleMode} style={{ marginRight: 16 }}>
          <View style={styles.headerButton}>
            {selectionMode ? <MousePointer size={20} color="darkmagenta" /> : <Eye size={20} color="black" />}
          </View>
        </TouchableOpacity>
      ),
      headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: 'black' },
    });
  }, [navigation, selectionMode, toggleMode]);

  // Fetch plans
  useEffect(() => {
    if (!project?.id) return;

    const fetchPlans = async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name')
        .eq('project_id', project.id)
        .order('name');

      if (error) {
        console.error('Failed to fetch plans:', error);
      } else {
        setPlans(data || []);
      }
    };

    fetchPlans();
  }, [project?.id]);

  // Fetch media with filters
  useEffect(() => {
    if (!project?.id) return;

   const fetchMedia = async () => {
  let query = supabase
    .from('pins_photos')
    .select('*, pdf_pins!inner(*), members(*)')
    .eq('project_id', project.id)
    .is('pdf_pins.deleted_at', null);
      // Apply plan filter
      if (selectedPlan) {
        query = query.eq('pin_id', selectedPlan);
      }

      // Apply date range filter
      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data, error } = await query;
      console.log("medias", data);

      if (error) {
        console.error('Failed to fetch media:', error);
      } else {
        setMedia(data);
        setGroupedMedia(groupMediaByDate(data));
      }
    };

    fetchMedia();
  }, [project?.id, selectedPlan, startDate, endDate]);

  // Update active filters indicator
  useEffect(() => {
    setHasActiveFilters(!!(selectedPlan || startDate || endDate));
  }, [selectedPlan, startDate, endDate]);

  const groupMediaByDate = (items) => {
    const map = new Map();
    for (const item of items) {
      const date = new Date(item.created_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    }

    const chunkRows = (arr) => {
      const rows = [];
      for (let i = 0; i < arr.length; i += 3) {
        rows.push(arr.slice(i, i + 3));
      }
      return rows;
    };

    return Array.from(map.entries()).map(([title, data]) => ({
      title,
      data: chunkRows(data),
    }));
  };

  const handlePressItem = (item) => {
    if (selectionMode) {
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.has(item.id) ? newSet.delete(item.id) : newSet.add(item.id);
        return newSet;
      });
    } else {
      setSelectedImage({
        imageUrl: item.public_url,
        userName: item?.members?.name || 'Utilisateur inconnu',
        description: item.note || '',
      });
    }
  };

  const handleCloseModal = () => setSelectedImage(null);

  const handleFilter = () => {
    setFilterModalVisible(true);
  };

  const handleApplyFilters = () => {
    setFilterModalVisible(false);
  };

  const handleClearFilters = () => {
    setSelectedPlan(null);
    setStartDate(null);
    setEndDate(null);
  };

  const handleDownloadReport = useCallback(async () => {
    if (selectedIds.size === 0 || isDownloading) return;

    const showMessage = (message) => {
      console.warn(message);
      alert(message);
    };

    setIsDownloading(true);
    const idsArray = Array.from(selectedIds);
    const idsQuery = idsArray.join(",");

    const apiUrl = `https://zaynbackend-production.up.railway.app/api/mediareport?projectId=${project.id}&selectedIds=${idsQuery}`;
    console.log("API URL:", apiUrl);
    
    const dateString = new Date().toISOString().substring(0, 10).replace(/-/g, '');
    const downloadFileName = `Rapport_Medias_${project?.id || 'Export'}_${dateString}.pdf`;
    const localUri = FileSystem.documentDirectory + downloadFileName;

    try {
      const downloadResult = await FileSystem.downloadAsync(
        apiUrl,
        localUri,
        {
          httpMethod: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (downloadResult.status !== 200) {
        console.error(`Erreur de téléchargement API: Statut ${downloadResult.status}`);
        showMessage(`Erreur lors de la génération du PDF. Statut: ${downloadResult.status}`);
        return;
      }

      if (!(await Sharing.isAvailableAsync())) {
        showMessage("Le partage de fichiers n'est pas disponible sur cet appareil.");
        return;
      }

      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Partager le rapport de médias PDF',
      });

      setSelectedIds(new Set());

    } catch (error) {
      console.error('Erreur de Téléchargement/Partage:', error);
      showMessage(`Une erreur inattendue est survenue : ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  }, [selectedIds, project?.id, isDownloading]);

  const renderSectionHeader = ({ section: { title } }) => (
    <Text style={styles.groupDateText}>{title}</Text>
  );

  const renderItem = ({ item: row }) => (
    <View style={{ flexDirection: 'row' }}>
      {row.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => handlePressItem(item)}
          style={[styles.thumbnailWrapper, selectionMode && selectedIds.has(item.id) && styles.selected]}
        >
          <Image
            style={styles.thumbnail}
            source={item.public_url}
            contentFit="cover"
            cachePolicy="disk"
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Active Filters Badge */}
      {hasActiveFilters && (
        <View style={styles.activeFiltersBadge}>
          <Text style={styles.activeFiltersText}>
            Filtres actifs: {[
              selectedPlan && `Plan: ${plans.find(p => p.id === selectedPlan)?.name}`,
              startDate && `Du: ${startDate.toLocaleDateString('fr-FR')}`,
              endDate && `Au: ${endDate.toLocaleDateString('fr-FR')}`
            ].filter(Boolean).join(' • ')}
          </Text>
          <TouchableOpacity onPress={handleClearFilters} style={styles.clearFiltersBtn}>
            <X size={16} color="#6D28D9" />
          </TouchableOpacity>
        </View>
      )}

      <SectionList
        sections={groupedMedia}
        keyExtractor={(itemRow, rowIndex) => itemRow.map(i => i.id).join('-') + '-' + rowIndex}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucun média trouvé</Text>
          </View>
        }
      />

      {/* Floating Action Buttons */}
      <View style={styles.floatingBar}>
        {selectionMode && selectedIds.size > 0 && (
          <TouchableOpacity
            style={styles.downloadFloatingBtn}
            onPress={handleDownloadReport}
            activeOpacity={0.8}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <ActivityIndicator size="small" color="white" />
                <Text style={styles.downloadText}>Téléchargement...</Text>
              </>
            ) : (
              <>
                <Feather name="download-cloud" size={16} color="white" />
                <Text style={styles.downloadText}>Télécharger le rapport</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.filterFloatingBtn, hasActiveFilters && styles.filterActiveBtn]}
          onPress={handleFilter}
          activeOpacity={0.8}
        >
          <ListFilter size={18} color="white" />
          {hasActiveFilters && <View style={styles.filterDot} />}
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtres</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <X size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Plan Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Filtrer par plan</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.plansList}>
                  <TouchableOpacity
                    style={[styles.planChip, !selectedPlan && styles.planChipActive]}
                    onPress={() => setSelectedPlan(null)}
                  >
                    <Text style={[styles.planChipText, !selectedPlan && styles.planChipTextActive]}>
                      Tous
                    </Text>
                  </TouchableOpacity>
                  {plans.map((plan) => (
                    <TouchableOpacity
                      key={plan.id}
                      style={[styles.planChip, selectedPlan === plan.id && styles.planChipActive]}
                      onPress={() => setSelectedPlan(plan.id)}
                    >
                      <Text style={[styles.planChipText, selectedPlan === plan.id && styles.planChipTextActive]}>
                        {plan.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Date Range Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Filtrer par période</Text>
                
                <View style={styles.dateRow}>
                  <View style={styles.dateInputWrapper}>
                    <Text style={styles.dateInputLabel}>Date de début</Text>
                    <TouchableOpacity
                      style={styles.dateInput}
                      onPress={() => setShowStartDatePicker(true)}
                    >
                      <Text style={styles.dateInputText}>
                        {startDate ? startDate.toLocaleDateString('fr-FR') : 'Sélectionner'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dateInputWrapper}>
                    <Text style={styles.dateInputLabel}>Date de fin</Text>
                    <TouchableOpacity
                      style={styles.dateInput}
                      onPress={() => setShowEndDatePicker(true)}
                    >
                      <Text style={styles.dateInputText}>
                        {endDate ? endDate.toLocaleDateString('fr-FR') : 'Sélectionner'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {(startDate || endDate) && (
                  <TouchableOpacity
                    style={styles.clearDatesBtn}
                    onPress={() => {
                      setStartDate(null);
                      setEndDate(null);
                    }}
                  >
                    <Text style={styles.clearDatesBtnText}>Effacer les dates</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.clearAllBtn}
                onPress={handleClearFilters}
              >
                <Text style={styles.clearAllBtnText}>Tout effacer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={handleApplyFilters}
              >
                <Text style={styles.applyBtnText}>Appliquer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Pickers */}
      {showStartDatePicker && (
        <DateTimePicker
          value={startDate || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowStartDatePicker(false);
            if (selectedDate) setStartDate(selectedDate);
          }}
        />
      )}

      {showEndDatePicker && (
        <DateTimePicker
          value={endDate || new Date()}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowEndDatePicker(false);
            if (selectedDate) setEndDate(selectedDate);
          }}
        />
      )}

      {selectedImage && (
        <ImageViewerModal
          visible={!!selectedImage}
          onClose={handleCloseModal}
          imageUrl={selectedImage.imageUrl}
          userName={selectedImage.userName}
          description={selectedImage.description}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingHorizontal: 12,
    paddingTop: 16
  },
  headerButton: {
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
  groupDateText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
    marginLeft: 4
  },
  thumbnailWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    margin: 4,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden'
  },
  thumbnail: {
    width: '100%',
    height: '100%'
  },
  selected: {
    borderWidth: 3,
    borderColor: 'darkmagenta'
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: '#9CA3AF',
  },

  // Active Filters Badge
  activeFiltersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  activeFiltersText: {
    flex: 1,
    fontFamily: 'Outfit_500Medium',
    fontSize: 12,
    color: '#6D28D9',
  },
  clearFiltersBtn: {
    padding: 4,
  },

  // Floating Action Buttons
  floatingBar: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterFloatingBtn: {
    backgroundColor: '#6D28D9',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    position: 'relative',
  },
  filterActiveBtn: {
    backgroundColor: '#7C3AED',
  },
  filterDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FCD34D',
  },
  downloadFloatingBtn: {
    backgroundColor: '#6D28D9',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 24,
    gap: 6,
    elevation: 4,
  },
  downloadText: {
    color: 'white',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
  },

  // Filter Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#111827',
  },
  modalBody: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
  },
  plansList: {
    flexDirection: 'row',
  },
  planChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  planChipActive: {
    backgroundColor: '#6D28D9',
  },
  planChipText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  planChipTextActive: {
    color: 'white',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInputWrapper: {
    flex: 1,
  },
  dateInputLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  dateInputText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: '#374151',
  },
  clearDatesBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  clearDatesBtnText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: '#6D28D9',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  clearAllBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  clearAllBtnText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: '#6B7280',
  },
  applyBtn: {
    flex: 1,
    backgroundColor: '#6D28D9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyBtnText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: 'white',
  },
});