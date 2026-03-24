import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useAtom } from 'jotai';
import { groupBy } from 'lodash';
import { ArrowDownNarrowWideIcon, ListFilter, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Checkbox } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CategoryFilter from '../../components/FilterPanel/CategoryFilter';
import DateFilter from '../../components/FilterPanel/DateFilter';
import OverdueFilter from '../../components/FilterPanel/OverdueFilter';
import PlanFilter from '../../components/FilterPanel/PlanFilter';
import StatusFilter from '../../components/FilterPanel/StatusFilter';
import TaskListItem from '../../components/TaskListItem';
import { supabase } from '../../lib/supabase';

import AssignedToFilter from '../../components/FilterPanel/AssignedToFilter';
import TagFilter from '../../components/FilterPanel/TagFilter';
import { loggedInUserAtom, pinsAtom, selectedProjectAtom, statusesAtom } from '../../store/atoms';

// --- CONFIGURATION DU TRI ---
const SORT_FIELDS = [
    { key: 'pin_number', label: 'Numéro de tâche', isDate: false },
    { key: 'status_id', label: 'Statut', isDate: false },
    { key: 'created_at', label: 'Date de création', isDate: true },
    { key: 'due_date', label: 'Date échéance', isDate: true },
    { key: 'name', label: 'Nom de la tâche', isDate: false }, 
    { key: 'pdf_name', label: 'Plan associé', isDate: false },
    { key: 'assigned_to_id', label: 'Assigné à', isDate: false },
    { key: 'task_type', label: 'Type de tâche', isDate: false },
];

const getSortedPins = (pinsToSort, field, direction) => {
    const sortedResult = [...pinsToSort];
    sortedResult.sort((a, b) => {
        const currentSort = SORT_FIELDS.find(f => f.key === field);
        let valA, valB;
        if (currentSort?.isDate) {
            valA = a[field] ? new Date(a[field]).getTime() : 0;
            valB = b[field] ? new Date(b[field]).getTime() : 0;
        } else if (field === 'status_id') {
            valA = a.Status?.id || 9999;
            valB = b.Status?.id || 9999;
        } else if (field === 'assigned_to_id') {
            valA = a.assigned_to?.id || 9999;
            valB = b.assigned_to?.id || 9999;
        } else if (field === 'pin_number') {
            valA = parseInt(a[field], 10) || 0;
            valB = parseInt(b[field], 10) || 0;
        } else if (field === 'task_type') {
            valA = a.pdf_name ? 0 : 1;
            valB = b.pdf_name ? 0 : 1;
        } else {
            valA = (a[field] || '').toLowerCase();
            valB = (b[field] || '').toLowerCase();
        }
        let comparison = 0;
        const isAEmpty = !valA || (typeof valA === 'string' && valA === '');
        const isBEmpty = !valB || (typeof valB === 'string' && valB === '');
        if (isAEmpty && isBEmpty) comparison = 0;
        else if (isAEmpty) comparison = 1;
        else if (isBEmpty) comparison = -1;
        else if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;
        return direction === 'desc' ? comparison * -1 : comparison;
    });
    return sortedResult;
};

// ─── Custom Checkbox (iOS only — Android uses react-native-paper) ────────────
const CustomCheckbox = ({ checked, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: checked ? 'darkmagenta' : '#D1D5DB',
            backgroundColor: checked ? 'darkmagenta' : 'white',
            alignItems: 'center',
            justifyContent: 'center',
        }}
    >
        {checked && <Feather name="check" size={13} color="white" />}
    </TouchableOpacity>
);

// ─── Platform-aware Checkbox ─────────────────────────────────────────────────
const AppCheckbox = ({ checked, onPress }) => {
    if (Platform.OS === 'android') {
        return (
            <Checkbox
                status={checked ? 'checked' : 'unchecked'}
                color="darkmagenta"
                onPress={onPress}
            />
        );
    }
    return <CustomCheckbox checked={checked} onPress={onPress} />;
};

// ------------------------------------------------------------------
// --- DÉBUT DU COMPOSANT PRINCIPAL : TASKS SCREEN ---
// ------------------------------------------------------------------
export default function TasksScreen() {
    const [projects] = useAtom(selectedProjectAtom);
    const [pins, setPins] = useAtom(pinsAtom);
    const [filteredPins, setFilteredPins] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    
    const [isDownloading, setIsDownloading] = useState(false);
    
    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    const [newTaskName, setNewTaskName] = useState('');
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    
    const [searchTerm, setSearchTerm] = useState('');
    const navigation = useNavigation();
    const isFocused = useIsFocused();
const insets = useSafeAreaInsets();
    const [showFilterPanel, setShowFilterPanel] = useState(false);
    const [createdByMe, setCreatedByMe] = useState(false);
    const [overdue, setOverdue] = useState(false);
    const [dateActive, setDateActive] = useState(false);
    const [dateTags, setDateTags] = useState([]);
    const [activeStatuses, setActiveStatuses] = useState([]);
    const [categoryTags, setCategoryTags] = useState([]);
    const [categoryActive, setCategoryActive] = useState(false);
    const [planActive, setPlanActive] = useState(false);
    const [tagActive, setTagActive] = useState(false);
const [selectedTagIds, setSelectedTagIds] = useState([]);
const [selectedPlans, setSelectedPlans] = useState([]);

    const [sortField, setSortField] = useState(SORT_FIELDS[0].key);
    const [sortDirection, setSortDirection] = useState('asc'); 
    const [currentSortIndex, setCurrentSortIndex] = useState(0); 
    const [showSortSheet, setShowSortSheet] = useState(false); 

    const [loggedInUser] = useAtom(loggedInUserAtom);
    const [statuses] = useAtom(statusesAtom);

    const [assignedToActive, setAssignedToActive] = useState(false);
const [selectedAssignees, setSelectedAssignees] = useState([]);



    const handleCreateGeneralTask = useCallback(async () => {
        if (!newTaskName.trim() || isCreatingTask) return;
        setIsCreatingTask(true);
        try {
            const { data: existingPins } = await supabase
                .from('pdf_pins')
                .select('pin_number')
                .eq('project_id', projects?.id)
                .order('pin_number', { ascending: false })
                .limit(1);

            const nextPinNumber = existingPins && existingPins.length > 0 
                ? parseInt(existingPins[0].pin_number) + 1 
                : 1;

            const { data, error } = await supabase
                .from('pdf_pins')
                .insert({
                    project_id: projects?.id,
                    name: newTaskName.trim(),
                    note: newTaskDescription.trim() || null,
                    pin_number: nextPinNumber.toString(),
                    created_by: loggedInUser?.id,
                    status_id: statuses?.[0]?.id || 1,
                })
                .select('*, assigned_to(*), categories(*), Status(*), pins_photos(*)')
                .single();

            if (error) throw error;

            if (data) {
                setNewTaskName('');
                setNewTaskDescription('');
                setShowCreateTaskModal(false);
                setPins(prev => {
                    const updated = [...prev, data];
                    return getSortedPins(updated, sortField, sortDirection);
                });

                
            }

            setNewTaskName('');
            setNewTaskDescription('');
            setShowCreateTaskModal(false);
            
        } catch (error) {
            console.error('Erreur lors de la création de la tâche:', error);
            Alert.alert('Erreur', error.message);
        } finally {
            setIsCreatingTask(false);
        }
    }, [newTaskName, newTaskDescription, projects?.id, loggedInUser?.id, statuses, sortField, sortDirection, setPins, isCreatingTask]);

    const handleDownloadPDF = useCallback(async () => {
        if (selectedIds.size === 0 || isDownloading) return;
        setIsDownloading(true);
        try {
            const selectedIdsArray = Array.from(selectedIds);
            const requestBody = {
                projectId: projects.id,
                selectedIds: selectedIdsArray,
                fields: {
                    description: true,
                    photos: true,
                    snapshot: true,
                    assignedTo: true,
                    dueDate: true,
                    category: true,
                    status: true,
                },
                displayMode: "list",
                templateConfig: null
            };

            const apiUrl = "https://zaynbackend-production.up.railway.app/api/report";
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Accept": "application/pdf"
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                Alert.alert('Erreur API', `${response.status}\n${errorText.substring(0, 200)}`);
                return;
            }

            const blob = await response.blob();
            const reader = new FileReader();
            
            reader.onloadend = async () => {
                try {
                    const base64data = reader.result.split(',')[1];
                    const dateString = new Date().toISOString().substring(0, 10).replace(/-/g, '');
                    const projectName = projects?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Export';
                    const fileName = `Rapport_${projectName}_${dateString}.pdf`;
                    const fileUri = FileSystem.documentDirectory + fileName;
                    await FileSystem.writeAsStringAsync(fileUri, base64data, {
                        encoding: 'base64',
                    });
                    const fileInfo = await FileSystem.getInfoAsync(fileUri);
                    if (!fileInfo.exists || fileInfo.size === 0) {
                        Alert.alert('Erreur', "Le fichier n'a pas été enregistré correctement.");
                        return;
                    }
                    if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(fileUri, {
                            mimeType: 'application/pdf',
                            dialogTitle: 'Partager le rapport PDF',
                            UTI: 'com.adobe.pdf',
                        });
                    } else {
                        Alert.alert('Erreur', "Le partage n'est pas disponible sur cet appareil.");
                    }
                    setSelectedIds(new Set());
                } catch (err) {
                    Alert.alert('Erreur', `Erreur lors de l'enregistrement: ${err.message}`);
                }
            };

            reader.onerror = () => Alert.alert('Erreur', 'Erreur lors de la lecture du fichier');
            reader.readAsDataURL(blob);
            
        } catch (error) {
            Alert.alert('Erreur', error.message);
        } finally {
            setIsDownloading(false);
        }
    }, [selectedIds, projects, isDownloading]);

    const fetchPins = useCallback(async () => {
        setLoading(true);
        if (loggedInUser?.role == 'guest') {
            const { data, error } = await supabase
                .from('pdf_pins')
                .select('*, assigned_to(*), categories(*), Status(*), pins_photos(*), pin_tags(tag_id, tags(*))')
                .is('deleted_at', null)
                .eq('project_id', projects?.id)
                .eq('assigned_to', loggedInUser.id);
            if (data) {
                const sortedData = getSortedPins(data, sortField, sortDirection);
                setPins(sortedData);
                setFilteredPins(sortedData);
            } else {
                console.error('Error loading pins:', error);
            }
        } else {
            const { data, error } = await supabase
                .from('pdf_pins')
                .select('*, assigned_to(*), categories(*), Status(*), pins_photos(*), pin_tags(tag_id, tags(*))')
                .is('deleted_at', null)
                .eq('project_id', projects?.id);
            if (data) {
                const sortedData = getSortedPins(data, sortField, sortDirection);
                setPins(sortedData);
                setFilteredPins(sortedData);
            } else {
                console.error('Error loading pins:', error);
            }
        }
        setLoading(false);
    }, [projects?.id, sortField, sortDirection, setPins, loggedInUser]);

    useEffect(() => {
        if (projects && isFocused) fetchPins();
    }, [projects, isFocused, fetchPins]);

    const handleOpenSortSheet = useCallback(() => setShowSortSheet(true), []);

    useEffect(() => {
        navigation.setOptions({
            title: 'Tâches',
            headerTitleAlign: 'center',
            headerLeft: () => (
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 10 }}>
                    <View style={{
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
                    }}>
                        <Feather name="arrow-left" size={20} color="#000" />
                    </View>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 16 }}>
                    <TouchableOpacity onPress={handleOpenSortSheet}>
                        <View style={{
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
                        }}>
                            <ArrowDownNarrowWideIcon size={20} color="#000" />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowCreateTaskModal(true)}>
                        <View style={{
                            backgroundColor: '#6D28D9',
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
                        }}>
                            <Plus size={20} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                </View>
            ),
            headerTitleStyle: {
                fontFamily: 'Outfit_700Bold',
                fontSize: 24,
                color: 'black',
            },
        });
    }, [projects, handleOpenSortSheet, navigation]);

    const toggleSelect = useCallback((id) => {
        setSelectedIds((prev) => {
            const newSet = new Set(prev);
            newSet.has(id) ? newSet.delete(id) : newSet.add(id);
            return newSet;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds((prev) =>
            prev.size === filteredPins.length && filteredPins.length > 0
                ? new Set()
                : new Set(filteredPins.map((p) => p.id))
        );
    }, [filteredPins]);

    const onClear = useCallback(() => {
        setCreatedByMe(false);
        setOverdue(false);
        setDateActive(false);
        setDateTags([]);
        setActiveStatuses([]);
        setCategoryActive(false);
        setCategoryTags([]);
        setPlanActive(false);
setSelectedPlans([]);
setAssignedToActive(false);
setSelectedAssignees([]);
setTagActive(false);
setSelectedTagIds([]);
    }, []);

    const onClose = useCallback(() => setShowFilterPanel(false), []);
    const updateSearch = useCallback((text) => setSearchTerm(text), []);

    const sortPins = useCallback((pinsToSort) => {
        return getSortedPins(pinsToSort, sortField, sortDirection);
    }, [sortField, sortDirection]);

    const applyAllFilters = useMemo(() => {
        return () => {
            let result = [...pins];
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                result = result.filter(
                    (p) =>
                        p.name?.toLowerCase().includes(lower) ||
                        p.pin_number?.toString().includes(lower) ||
                        p.pdf_name?.toLowerCase().includes(lower) ||
                        p.note?.toLowerCase().includes(lower) ||
                        p.assigned_to?.name?.toLowerCase().includes(lower)
                );
            }
            if (createdByMe && loggedInUser?.id) {
                result = result.filter((p) => p.created_by === loggedInUser.id);
            }
            if (activeStatuses.length > 0) {
                result = result.filter((p) => activeStatuses.includes(p.status_id));
            }
            if (overdue) {
                result = result.filter((p) => {
                    if (!p.due_date) return false;
                    const dueDate = new Date(p.due_date);
                    const today = new Date();
                    dueDate.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    return dueDate < today;
                });
            }
           if (dateActive) {
    if (dateTags.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            if (!p.created_at) return false;
            const created = new Date(p.created_at);
            const now = new Date();
            return dateTags.some((tag) => {
                if (tag === "Aujourd'hui") return created.toDateString() === now.toDateString();
                if (tag === 'Cette semaine') {
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    return created >= weekStart;
                }
                if (tag === 'Ce mois-ci') {
                    return created.getMonth() === now.getMonth() &&
                        created.getFullYear() === now.getFullYear();
                }
                return false;
            });
        });
    }
}
          if (categoryActive) {
    if (categoryTags.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            if (!p.categories) return false;
            const categoriesArray = Array.isArray(p.categories) ? p.categories : [p.categories];
            const validCategories = categoriesArray.filter(cat => cat != null);
            if (validCategories.length === 0) return false;
            return categoryTags.some(tagName =>
                validCategories.some(cat =>
                    cat && cat.name && cat.name.toLowerCase() === tagName.toLowerCase()
                )
            );
        });
    }
}
          if (planActive) {
    if (selectedPlans.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            if (selectedPlans.includes('__no_plan__') && !p.pdf_name) return true;
            if (selectedPlans.includes(p.pdf_name)) return true;
            return false;
        });
    }
}

if (tagActive) {
    if (selectedTagIds.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            const pinTagIds = (p.pin_tags ?? []).map((pt) => pt.tags?.id ?? pt.tag_id);
            return selectedTagIds.some((id) => pinTagIds.includes(id));
        });
    }
}
// AFTER
if (assignedToActive) {
    if (selectedAssignees.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            if (selectedAssignees.includes('__no_assignee__') && !p.assigned_to) return true;
            if (selectedAssignees.includes(p.assigned_to?.id)) return true;
            return false;
        });
    }
}
            result = sortPins(result);
            setFilteredPins(result);
        };
    }, [
        pins, searchTerm, createdByMe, activeStatuses, overdue, dateActive, dateTags,
        loggedInUser, categoryActive, planActive, selectedPlans, categoryTags, assignedToActive, selectedAssignees,
        tagActive, selectedTagIds, sortPins
    ]);

    useEffect(() => applyAllFilters(), [applyAllFilters]);

    const groupedPins = useMemo(() => {
        if (filteredPins.length === 0) return {};
        const groupByKey = (pin) => {
            if (sortField === 'status_id') return pin.Status?.name || 'Statut Indéfini';
            else if (sortField === 'created_at' || sortField === 'due_date') {
                const dateValue = pin[sortField];
                if (dateValue) {
                    return new Date(dateValue).toLocaleDateString('fr-FR', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    });
                }
                return 'Date Indéfinie';
            }
            else if (sortField === 'assigned_to_id') return pin.assigned_to?.name || 'Non Assigné';
            else if (sortField === 'task_type') return pin.pdf_name ? 'Tâches sur plan' : 'Tâches générales';
            const currentSort = SORT_FIELDS.find(f => f.key === sortField);
            return `Trié par : ${currentSort?.label || 'Défaut'}`;
        };
        return groupBy(filteredPins, groupByKey);
    }, [filteredPins, sortField]);

    const sections = useMemo(() => {
        return Object.entries(groupedPins).map(([title, data]) => ({ title, data }));
    }, [groupedPins]);

    const handleNavigateToMetadata = useCallback((pinId) => {
        navigation.navigate("PinMetadataScreen", {
            pinId,
            from: 'Tasks',
            photoUris: JSON.stringify([]),
        });
    }, [navigation]);
    const hasActiveFilter = useMemo(() => {
    return (
        overdue ||
        dateActive ||
        categoryActive ||
        activeStatuses.length > 0 ||
        planActive ||
        assignedToActive ||
        tagActive ||
        !!searchTerm
    );
}, [overdue, dateActive, categoryActive, activeStatuses, planActive, assignedToActive, tagActive, searchTerm]);

    const SortBottomSheet = () => {
        const handleSelectSort = (fieldKey, direction) => {
            setSortField(fieldKey);
            setSortDirection(direction);
            setCurrentSortIndex(SORT_FIELDS.findIndex(f => f.key === fieldKey));
            setShowSortSheet(false);
        };

        return (
            <Modal
                animationType="slide"
                transparent={true}
                visible={showSortSheet}
                onRequestClose={() => setShowSortSheet(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Trier les tâches par...</Text>
                            <TouchableOpacity onPress={() => setShowSortSheet(false)}>
                                <Feather name="x" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                            {SORT_FIELDS.map((field) => (
                                <View key={field.key} style={{ marginBottom: 10 }}>
                                    <Text style={styles.sortFieldTitle}>{field.label}</Text>
                                    <TouchableOpacity
                                        style={[styles.sortItem, (sortField === field.key && sortDirection === 'asc') && styles.sortItemActive]}
                                        onPress={() => handleSelectSort(field.key, 'asc')}
                                    >
                                        <Text style={styles.sortText}>
                                            {field.isDate ? 'Du plus ancien au plus récent' : 'A → Z (Croissant)'}
                                        </Text>
                                        {(sortField === field.key && sortDirection === 'asc') && (
                                            <Feather name="check" size={18} color="#6D28D9" style={{ marginLeft: 'auto' }} />
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.sortItem, (sortField === field.key && sortDirection === 'desc') && styles.sortItemActive]}
                                        onPress={() => handleSelectSort(field.key, 'desc')}
                                    >
                                        <Text style={styles.sortText}>
                                            {field.isDate ? 'Du plus récent au plus ancien' : 'Z → A (Décroissant)'}
                                        </Text>
                                        {(sortField === field.key && sortDirection === 'desc') && (
                                            <Feather name="check" size={18} color="#6D28D9" style={{ marginLeft: 'auto' }} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    return (
        <View style={styles.container}>
            {/* Search bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 12, marginBottom: 10 }}>
                <Feather name="search" size={20} color="#999" style={{ marginRight: 8 }} />
                <TextInput
                    placeholder="Rechercher par nom"
                    value={searchTerm}
                    onChangeText={updateSearch}
                    style={{ flex: 1, paddingVertical: 10, fontFamily: 'Outfit_400Regular' }}
                    placeholderTextColor="#999"
                />
            </View>

            {/* Select all row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <AppCheckbox
                    checked={selectedIds.size === filteredPins.length && filteredPins.length > 0}
                    onPress={toggleSelectAll}
                />
                <Text style={{ fontSize: 15, color: '#111827', fontFamily: 'Outfit_500Medium', marginLeft: 8 }}>
                    Tout sélectionner
                </Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#6D28D9" style={{ marginTop: 20 }} />
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => item.id}
                    renderSectionHeader={({ section: { title } }) => (
                        <View style={styles.sectionHeaderWrapper}>
                            <Text style={styles.groupDateText}>{title}</Text>
                        </View>
                    )}
                    renderItem={({ item: pin, section, index }) => {
                        const isLastItem = index === section.data.length - 1;
                        const isFirstItem = index === 0;
                        const itemStyle = [
                            styles.listCardWrapper,
                            isFirstItem && styles.sectionTopRadius,
                            isLastItem && styles.sectionBottomRadius,
                            !isFirstItem && styles.listCardNoShadow
                        ];
                        return (
                            <View style={itemStyle}>
                                <TaskListItem
                                    pin={pin}
                                    isSelected={selectedIds.has(pin.id)}
                                    toggleSelect={toggleSelect}
                                    isLastInGroup={isLastItem}
                                    onNavigate={handleNavigateToMetadata}
                                />
                            </View>
                        );
                    }}
                    ListFooterComponent={() => <View style={{ height: 20 }} />}
                    SectionSeparatorComponent={() => <View />}
                />
            )}

            {/* Filter modal */}
            <Modal visible={showFilterPanel} transparent animationType="slide" onRequestClose={onClose}>
                <View style={styles.modalOverlay}>
                   <View style={[styles.filterContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <View style={styles.header}>
                            <View>
                                <Text style={styles.title}>Filtres</Text>
                                <Text style={styles.subtitle}>{filteredPins.length} tâches</Text>
                            </View>
                            <View style={styles.headerRight}>
                                <TouchableOpacity onPress={onClear}>
                                    <Text style={styles.clearText}>Effacer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
                                    <Feather name="x" size={20} color="#000" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        <OverdueFilter active={overdue} onToggle={setOverdue} />
                        <DateFilter active={dateActive} onToggle={setDateActive} tags={dateTags} setTags={setDateTags} />
                        <CategoryFilter active={categoryActive} onToggle={setCategoryActive} tags={categoryTags} setTags={setCategoryTags} />
                        <StatusFilter activeStatuses={activeStatuses} setActiveStatuses={setActiveStatuses} selectedProject={projects} />
                        <TagFilter
    active={tagActive}
    onToggle={setTagActive}
    selectedTags={selectedTagIds}
    setSelectedTags={setSelectedTagIds}
/>
                        <PlanFilter
    active={planActive}
    onToggle={setPlanActive}
    selectedPlans={selectedPlans}
    setSelectedPlans={setSelectedPlans}
/>
<AssignedToFilter
    active={assignedToActive}
    onToggle={setAssignedToActive}
    selectedMembers={selectedAssignees}
    setSelectedMembers={setSelectedAssignees}
/>
                    </View>
                </View>
            </Modal>

            <SortBottomSheet />

            {/* Create task modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={showCreateTaskModal}
                onRequestClose={() => setShowCreateTaskModal(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.createTaskContainer}>
                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>Nouvelle tâche générale</Text>
                                <TouchableOpacity onPress={() => setShowCreateTaskModal(false)}>
                                    <Feather name="x" size={24} color="#333" />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                style={styles.createTaskForm}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={styles.inputLabel}>Nom de la tâche *</Text>
                                <TextInput
                                    style={styles.textInput}
                                    placeholder="Ex: Préparer le rapport mensuel"
                                    value={newTaskName}
                                    onChangeText={setNewTaskName}
                                    placeholderTextColor="#999"
                                />
                                <Text style={styles.inputLabel}>Description (optionnel)</Text>
                                <TextInput
                                    style={[styles.textInput, styles.textAreaInput]}
                                    placeholder="Ajouter une description..."
                                    value={newTaskDescription}
                                    onChangeText={setNewTaskDescription}
                                    multiline
                                    numberOfLines={4}
                                    placeholderTextColor="#999"
                                    textAlignVertical="top"
                                />
                                <View style={styles.infoBox}>
                                    <Feather name="info" size={16} color="#6D28D9" />
                                    <Text style={styles.infoText}>
                                        Cette tâche n'est pas liée à un plan. Vous pourrez ajouter plus de détails après la création.
                                    </Text>
                                </View>
                            </ScrollView>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.cancelButton]}
                                    onPress={() => setShowCreateTaskModal(false)}
                                >
                                    <Text style={styles.cancelButtonText}>Annuler</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.modalButton,
                                        styles.createButton,
                                        (!newTaskName.trim() || isCreatingTask) && styles.createButtonDisabled
                                    ]}
                                    onPress={handleCreateGeneralTask}
                                    disabled={!newTaskName.trim() || isCreatingTask}
                                >
                                    {isCreatingTask ? (
                                        <ActivityIndicator size="small" color="white" />
                                    ) : (
                                        <Text style={styles.createButtonText}>Créer</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Floating buttons */}
            <View style={styles.floatingBar}>
                {selectedIds.size > 0 && (
                    <TouchableOpacity
                        style={styles.downloadFloatingBtn}
                        onPress={handleDownloadPDF}
                        disabled={isDownloading}
                    >
                        {isDownloading ? (
                            <>
                                <ActivityIndicator size="small" color="white" />
                                <Text style={styles.downloadText}>Télécharger le rapport</Text>
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
    style={styles.filterFloatingBtn}
    onPress={() => setShowFilterPanel(true)}
>
    <ListFilter size={18} color="white" />
    {hasActiveFilter && (
        <View style={styles.filterActiveBadge}>
            <Text style={styles.filterActiveBadgeText}>{filteredPins.length}</Text>
        </View>
    )}
</TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA', padding: 16 },

    sectionHeaderWrapper: {
        paddingBottom: 6,
        paddingTop: 16,
        paddingHorizontal: 0,
        backgroundColor: '#F5F7FA', // ← matches container, prevents card bleed-through
        
    },
    groupDateText: {
        fontSize: 13,
        color: '#6B7280',
        fontFamily: 'Outfit_600SemiBold',
        textTransform: 'uppercase',
    },

    listCardWrapper: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 2, height: 2 },
        shadowRadius: 6,
        elevation: 0,
        marginBottom: 1,
    },
    listCardNoShadow: {
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    sectionTopRadius: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    sectionBottomRadius: {
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        marginBottom: 16,
    },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    filterContainer: { backgroundColor: 'white', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111827' },
    subtitle: { fontSize: 12, color: '#6B7280', fontFamily: 'Outfit_400Regular', marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    clearText: { color: 'darkmagenta', fontSize: 14, fontFamily: 'Outfit_400Regular', marginRight: 12 },
    closeIcon: { padding: 4 },

    bottomSheet: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 20,
        maxHeight: '70%',
        width: '100%',
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    sheetTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },
    sortFieldTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#333', marginTop: 15, marginBottom: 5 },
    sortItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: '#f9fafb',
        marginTop: 5,
    },
    sortItemActive: {
        backgroundColor: '#ede9fe',
        borderWidth: 1,
        borderColor: '#c4b5fd',
    },
    sortText: { fontSize: 15, color: '#333', fontFamily: 'Outfit_400Regular', marginLeft: 5 },

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
    downloadText: { color: 'white', fontFamily: 'Outfit_600SemiBold', fontSize: 13 },

    createTaskContainer: {
        backgroundColor: 'white',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20,
        maxHeight: '80%',
        width: '100%',
    },
    createTaskForm: { marginTop: 20, marginBottom: 20 },
    inputLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#374151', marginBottom: 8, marginTop: 16 },
    textInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 15,
        fontFamily: 'Outfit_400Regular',
        color: '#111827',
    },
    textAreaInput: { minHeight: 100, textAlignVertical: 'top' },
    infoBox: { flexDirection: 'row', backgroundColor: '#F3E8FF', padding: 12, borderRadius: 8, marginTop: 16, gap: 8 },
    infoText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6D28D9', lineHeight: 18 },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
    modalButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { backgroundColor: '#F3F4F6' },
    cancelButtonText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#374151' },
    createButton: { backgroundColor: '#6D28D9' },
    createButtonDisabled: { backgroundColor: '#D1D5DB' },
    createButtonText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#FFFFFF' },
    filterActiveBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#10b981',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
},
filterActiveBadgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Outfit_600SemiBold',
},
});