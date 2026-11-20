import { Feather } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { useAtom, useAtomValue } from 'jotai';
import uuid from 'react-native-uuid';
import { groupBy } from 'lodash';
import { ArrowDownNarrowWideIcon, ListFilter, Plus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert,
    Animated,
    Keyboard,
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
import ArchivedFilter from '../../components/FilterPanel/ArchivedFilter';
import CategoryFilter from '../../components/FilterPanel/CategoryFilter';
import DateFilter from '../../components/FilterPanel/DateFilter';
import OverdueFilter from '../../components/FilterPanel/OverdueFilter';
import PlanFilter from '../../components/FilterPanel/PlanFilter';
import StatusFilter from '../../components/FilterPanel/StatusFilter';
import TaskListItem from '../../components/TaskListItem';
import { supabase } from '../../lib/supabase';
import { requestReport } from '../../lib/api';
import ReportOptionsModal from '../../components/reports/ReportOptionsModal';
import { downloadAndShare } from '../../lib/reports';
import { cachedSelect, isOnline, queue, syncTickAtom, withPendingPins } from '../../lib/offline';


import AssignedToFilter from '../../components/FilterPanel/AssignedToFilter';
import TagFilter from '../../components/FilterPanel/TagFilter';
import { loggedInUserAtom, pinsAtom, selectedProjectAtom, statusesAtom } from '../../store/atoms';
import { HeaderButton, ScreenHeader } from '../../components/ui/ScreenHeader';
import { C } from '../../constants/theme';
import { Segmented } from '../../components/chantier/ui';
import { PIN_TYPES, pinType } from '../../lib/pinTypes';
import {
    REPORT_KINDS, kindForPinType, templateKind,
} from '../../lib/reportKinds';

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

const uint8ToBase64 = (bytes) => {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i;
    const len = bytes.length;
    for (i = 0; i + 2 < len; i += 3) {
        const b1 = bytes[i], b2 = bytes[i + 1], b3 = bytes[i + 2];
        result += CHARS[b1 >> 2];
        result += CHARS[((b1 & 3) << 4) | (b2 >> 4)];
        result += CHARS[((b2 & 15) << 2) | (b3 >> 6)];
        result += CHARS[b3 & 63];
    }
    if (i < len) {
        const b1 = bytes[i];
        result += CHARS[b1 >> 2];
        if (i + 1 < len) {
            const b2 = bytes[i + 1];
            result += CHARS[((b1 & 3) << 4) | (b2 >> 4)];
            result += CHARS[(b2 & 15) << 2];
            result += '=';
        } else {
            result += CHARS[(b1 & 3) << 4];
            result += '==';
        }
    }
    return result;
};

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

// ── Shimmer skeleton (même pattern que AcceuilScreen) ────────────────────────
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
                { width, height, borderRadius, backgroundColor: '#E4E4E0', opacity: anim },
                style,
            ]}
        />
    );
}

function TaskRowSkeleton() {
    return (
        <View style={styles.skeletonCard}>
            <SkeletonBox width={22} height={22} borderRadius={6} />
            <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
                <SkeletonBox width="70%" height={14} borderRadius={4} />
                <SkeletonBox width="40%" height={11} borderRadius={4} />
            </View>
            <SkeletonBox width={24} height={24} borderRadius={12} />
        </View>
    );
}

function TasksSkeleton() {
    return (
        <View>
            <SkeletonBox width={90} height={11} borderRadius={4} style={{ marginBottom: 10, marginLeft: 4 }} />
            <View style={styles.skeletonGroup}>
                {[0, 1, 2].map(i => (
                    <View key={i} style={[
                        i === 0 && styles.sectionTopRadius,
                        i === 2 && styles.sectionBottomRadius,
                        i !== 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F3F0' },
                    ]}>
                        <TaskRowSkeleton />
                    </View>
                ))}
            </View>

            <SkeletonBox width={110} height={11} borderRadius={4} style={{ marginTop: 24, marginBottom: 10, marginLeft: 4 }} />
            <View style={styles.skeletonGroup}>
                {[0, 1].map(i => (
                    <View key={i} style={[
                        i === 0 && styles.sectionTopRadius,
                        i === 1 && styles.sectionBottomRadius,
                        i !== 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F3F0' },
                    ]}>
                        <TaskRowSkeleton />
                    </View>
                ))}
            </View>
        </View>
    );
}

const CustomCheckbox = ({ checked, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
            width: 22, height: 22, borderRadius: 6, borderWidth: 2,
            borderColor: checked ? 'black' : '#D3D3CE',
            backgroundColor: checked ? 'black' : 'white',
            alignItems: 'center', justifyContent: 'center',
        }}
    >
        {checked && <Feather name="check" size={13} color="white" />}
    </TouchableOpacity>
);

const AppCheckbox = ({ checked, onPress }) => {
    if (Platform.OS === 'android') {
        return <Checkbox status={checked ? 'checked' : 'unchecked'} color="black" onPress={onPress} />;
    }
    return <CustomCheckbox checked={checked} onPress={onPress} />;
};

// ─── FIELD LABELS ────────────────────────────────────────────────────────────


// ------------------------------------------------------------------
// --- COMPOSANT PRINCIPAL : TASKS SCREEN ---
// ------------------------------------------------------------------
export default function TasksScreen() {
    const [projects] = useAtom(selectedProjectAtom);
    const [pins, setPins] = useAtom(pinsAtom);
    const [filteredPins, setFilteredPins] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);

    const [isDownloading, setIsDownloading] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [availableTemplates, setAvailableTemplates] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [projectMembers, setProjectMembers] = useState([]);

    const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
    // Nature affichée (null = tout) et nature de l'élément en cours de création.
    const [natureFilter, setNatureFilter] = useState(null);

    // Type de rapport : suit l'onglet (Réserves → rapport de réserves, etc.).
    const [reportKind, setReportKind] = useState('libre');
    useEffect(() => setReportKind(kindForPinType(natureFilter)), [natureFilter]);
    // Rapport lancé depuis la liste : tout l'onglet (filtres compris), sans cocher.
    const [reportWholeTab, setReportWholeTab] = useState(false);
    // Modèles du type choisi, plus les modèles « libres » qui servent pour tous.
    const kindTemplates = useMemo(
        () => availableTemplates.filter((t) => templateKind(t) === reportKind || templateKind(t) === 'libre'),
        [availableTemplates, reportKind]
    );
    // Par défaut : le modèle par défaut de ce type, sinon la présentation du type.
    useEffect(() => {
        const own = availableTemplates.filter((t) => templateKind(t) === reportKind);
        setSelectedTemplate(own.find((t) => t.is_default) || own[0] || null);
    }, [availableTemplates, reportKind]);
    const [newNature, setNewNature] = useState('tache');
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
    const [showArchived, setShowArchived] = useState(false);
    
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

     const [createTaskKeyboardOffset, setCreateTaskKeyboardOffset] = useState(0); // ── NEW

// ── Keyboard listeners pour le modal "Nouvelle tâche" ──
useEffect(() => {
    if (!showCreateTaskModal) return;
    const show = Keyboard.addListener(
        Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
        (e) => setCreateTaskKeyboardOffset(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
        Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
        () => setCreateTaskKeyboardOffset(0)
    );
    return () => { show.remove(); hide.remove(); };
}, [showCreateTaskModal]);

useEffect(() => {
    if (!showCreateTaskModal) setCreateTaskKeyboardOffset(0);
}, [showCreateTaskModal]);


    // ── Fetch templates ──
    useEffect(() => {
        if (!projects?.organization_id) return;
        const fetchTemplates = async () => {
            const { data } = await supabase
                .from('report_templates')
                .select('*')
                .eq('organization_id', projects.organization_id)
                .order('created_at', { ascending: false });
            if (data) setAvailableTemplates(data);
        };
        fetchTemplates();
    }, [projects?.organization_id]);

    // ── Fetch project members ──
    useEffect(() => {
        if (!projects?.id) return;
        const fetchMembers = async () => {
            const { data } = await supabase
                .from('members_projects')
                .select('id, role, members(id, name, email)')
                .eq('project_id', projects.id);
            if (data) {
                setProjectMembers(data.map(m => ({ ...m.members, role: m.role, memberId: m.id })));
            }
        };
        fetchMembers();
    }, [projects?.id]);

  const handleGenerateReport = useCallback(async ({
    progress,
    progressContent,
    lotIds = [],
    cartouche,
    reportTitle,
    displayMode,
    fields,
    participants,
    customSections,
    planningImages,
    planningObservations,
}) => {
    // Rapport par lot sur tout l'onglet : les éléments de ces lots, quel que
    // soit le filtre de lot de la liste (le serveur ne garde que la bonne nature).
    const lotSet = new Set(lotIds.map(String));
    const ids = reportWholeTab
        ? (lotSet.size ? pins.filter((p) => lotSet.has(String(p.category_id)) && (showArchived || !p.isArchived)) : filteredPins).map((p) => p.id)
        : Array.from(selectedIds);
    if (ids.length === 0 || isDownloading) return;
    if (!isOnline()) {
        Alert.alert('Indisponible hors ligne', 'La génération du rapport nécessite une connexion.');
        return;
    }
    setShowReportModal(false);
    setIsDownloading(true);
    try {
        const requestBody = {
            projectId: projects.id,
            selectedIds: ids,
            reportKind,
            templateKind: templateKind(selectedTemplate),
            ...(progress ? { progress } : {}),
            ...(progressContent ? { progressContent } : {}),
            ...(lotIds.length ? { lotIds } : {}),
            ...(cartouche ? { cartouche } : {}),
            fields,
            displayMode,
            templateConfig: selectedTemplate?.config || null,
            templateId: selectedTemplate?.id ?? null,
            reportTitle,
            participants,
            customSections,
            planningImages,
            planningObservations,
        };

        // Le rapport est généré en arrière-plan côté serveur ; on attend son lien.
        let json;
        try {
            json = await requestReport('/api/report', requestBody);
        } catch (err) {
            Alert.alert('Erreur', `Le rapport n'a pas pu être généré.\n${err.message}`);
            return;
        }
        const { downloadUrl, fileName: serverFileName } = json;

        if (!downloadUrl) {
            Alert.alert('Erreur', 'URL de téléchargement manquante dans la réponse');
            return;
        }

        await downloadAndShare(downloadUrl, serverFileName);

        if (!reportWholeTab) setSelectedIds(new Set());
    } catch (error) {
        console.error('PDF generation error:', error);
        Alert.alert('Erreur', error.message || 'Erreur inconnue lors de la génération');
    } finally {
        setIsDownloading(false);
        setReportWholeTab(false);
    }
}, [selectedIds, projects, isDownloading, selectedTemplate, reportKind, reportWholeTab, filteredPins, pins, showArchived]);

    const handleCreateGeneralTask = useCallback(async () => {
        if (!newTaskName.trim() || isCreatingTask) return;
        setIsCreatingTask(true);
        try {
            if (!isOnline()) {
                // Hors ligne : la tâche est créée sur l'appareil et envoyée plus tard.
                // Son numéro est attribué par le serveur à l'envoi.
                const nowIso = new Date().toISOString();
                const row = {
                    id: uuid.v4(),
                    project_id: projects?.id,
                    name: newTaskName.trim(),
                    note: newTaskDescription.trim() || null,
                    type: newNature,
                    created_by: loggedInUser?.id,
                    updated_by: loggedInUser?.id,
                    created_at: nowIso,
                    updated_at: nowIso,
                    status_id: statuses?.[0]?.id ?? null,
                };
                await queue('pin.insert', { row });
                setPins(prev => getSortedPins([...prev, { ...row, Status: statuses?.[0] ?? null, _pending: true }], sortField, sortDirection));
                setNewTaskName('');
                setNewTaskDescription('');
                setShowCreateTaskModal(false);
                return;
            }
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
                    type: newNature,
                    pin_number: nextPinNumber.toString(),
                    created_by: loggedInUser?.id,
                    updated_by: loggedInUser?.id,
                    updated_at: new Date().toISOString(),
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

    const fetchPins = useCallback(async () => {
        setLoading(true);
        const pid = projects?.id;
        const guest = loggedInUser?.role == 'guest';
        // Hors ligne : dernière liste enregistrée, complétée des modifications en attente.
        const { data, error, cachedAt } = await cachedSelect(`pins-tasks-${pid}${guest ? `-${loggedInUser.id}` : ''}`, () => {
            let query = supabase
                .from('pdf_pins')
                .select('*, assigned_to(*), categories(*), Status(*), pins_photos(*), pin_tags(tag_id, tags(*))')
                .is('deleted_at', null)
                .eq('project_id', pid);
            if (guest) query = query.eq('assigned_to', loggedInUser.id);
            return query;
        });
        if (data || error?.offline) {
            const merged = withPendingPins(data ?? [], { projectId: pid, assignedTo: guest ? loggedInUser.id : undefined }, cachedAt);
            const sortedData = getSortedPins(merged, sortField, sortDirection);
            setPins(sortedData);
            setFilteredPins(sortedData);
        } else {
            console.error('Error loading pins:', error);
        }
        setLoading(false);
    }, [projects?.id, sortField, sortDirection, setPins, loggedInUser]);

    const syncTick = useAtomValue(syncTickAtom);
    useEffect(() => {
        if (projects && isFocused) fetchPins();
    }, [projects, isFocused, fetchPins, syncTick]);

    const handleOpenSortSheet = useCallback(() => setShowSortSheet(true), []);

    // Compteur sous le titre : tâches affichées et, parmi elles, celles dont
    // l'échéance est dépassée sans avoir atteint le dernier statut.
    const headerSubtitle = useMemo(() => {
        const lastOrder = statuses?.length ? Math.max(...statuses.map((st) => st.order ?? 0)) : null;
        const now = Date.now();
        const late = filteredPins.filter((p) =>
            p.due_date && Date.parse(p.due_date) < now && !(lastOrder != null && p.Status?.order === lastOrder)
        ).length;
        const n = filteredPins.length;
        const label = natureFilter
            ? PIN_TYPES[natureFilter].label.toLowerCase() + (n > 1 ? 's' : '')
            : `élément${n > 1 ? 's' : ''}`;
        return `${n} ${label}${late ? `, ${late} en retard` : ''}`;
    }, [filteredPins, statuses, natureFilter]);

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
        setCreatedByMe(false); setOverdue(false); setDateActive(false); setDateTags([]);
        setActiveStatuses([]); setCategoryActive(false); setCategoryTags([]);
        setPlanActive(false); setSelectedPlans([]); setAssignedToActive(false);
        setSelectedAssignees([]); setTagActive(false); setSelectedTagIds([]);
    }, []);

    const onClose = useCallback(() => setShowFilterPanel(false), []);
    const updateSearch = useCallback((text) => setSearchTerm(text), []);
    const sortPins = useCallback((pinsToSort) => getSortedPins(pinsToSort, sortField, sortDirection), [sortField, sortDirection]);

    const applyAllFilters = useMemo(() => {
        return () => {
            let result = [...pins];
            if (!showArchived) {
            result = result.filter(p => !p.isArchived);
        }
            if (searchTerm) {
                const lower = searchTerm.toLowerCase();
                result = result.filter(p =>
                    p.name?.toLowerCase().includes(lower) ||
                    p.pin_number?.toString().includes(lower) ||
                    p.pdf_name?.toLowerCase().includes(lower) ||
                    p.note?.toLowerCase().includes(lower) ||
                    p.assigned_to?.name?.toLowerCase().includes(lower)
                );
            }
            if (natureFilter) result = result.filter(p => pinType(p) === natureFilter);
            if (createdByMe && loggedInUser?.id) result = result.filter(p => p.created_by === loggedInUser.id);
            if (activeStatuses.length > 0) result = result.filter(p => activeStatuses.includes(p.status_id));
            if (overdue) {
                result = result.filter(p => {
                    if (!p.due_date) return false;
                    const dueDate = new Date(p.due_date);
                    const today = new Date();
                    dueDate.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
                    return dueDate < today;
                });
            }
            if (dateActive) {
                if (dateTags.length === 0) { result = []; }
                else {
                    result = result.filter(p => {
                        if (!p.created_at) return false;
                        const created = new Date(p.created_at);
                        const now = new Date();
                        return dateTags.some(tag => {
                            if (tag === "Aujourd'hui") return created.toDateString() === now.toDateString();
                            if (tag === 'Cette semaine') { const ws = new Date(now); ws.setDate(now.getDate() - now.getDay()); return created >= ws; }
                            if (tag === 'Ce mois-ci') return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                            return false;
                        });
                    });
                }
            }
            if (categoryActive) {
                if (categoryTags.length === 0) { result = []; }
                else {
                    result = result.filter(p => {
                        if (!p.categories) return false;
                        const cats = Array.isArray(p.categories) ? p.categories : [p.categories];
                        const valid = cats.filter(c => c != null);
                        if (valid.length === 0) return false;
                        return categoryTags.some(tagName => valid.some(c => c?.name?.toLowerCase() === tagName.toLowerCase()));
                    });
                }
            }
            if (planActive) {
                if (selectedPlans.length === 0) { result = []; }
                else {
                    result = result.filter(p => {
                        if (selectedPlans.includes('__no_plan__') && !p.pdf_name) return true;
                        return selectedPlans.includes(p.pdf_name);
                    });
                }
            }
            if (tagActive) {
                if (selectedTagIds.length === 0) { result = []; }
                else {
                    result = result.filter(p => {
                        const pinTagIds = (p.pin_tags ?? []).map(pt => pt.tags?.id ?? pt.tag_id);
                        return selectedTagIds.some(id => pinTagIds.includes(id));
                    });
                }
            }
            if (assignedToActive) {
                if (selectedAssignees.length === 0) { result = []; }
                else {
                    result = result.filter(p => {
                        if (selectedAssignees.includes('__no_assignee__') && !p.assigned_to) return true;
                        return selectedAssignees.includes(p.assigned_to?.id);
                    });
                }
            }
           
            result = sortPins(result);
            setFilteredPins(result);
        };
    }, [pins, natureFilter, searchTerm, createdByMe, activeStatuses, overdue, dateActive, dateTags, loggedInUser, categoryActive, planActive, selectedPlans, categoryTags, assignedToActive, selectedAssignees, tagActive, selectedTagIds, showArchived, sortPins]);

    useEffect(() => applyAllFilters(), [applyAllFilters]);

    const groupedPins = useMemo(() => {
        if (filteredPins.length === 0) return {};
        const groupByKey = (pin) => {
            if (sortField === 'status_id') return pin.Status?.name || 'Statut Indéfini';
            else if (sortField === 'created_at' || sortField === 'due_date') {
                const dateValue = pin[sortField];
                if (dateValue) return new Date(dateValue).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                return 'Date Indéfinie';
            }
            else if (sortField === 'assigned_to_id') return pin.assigned_to?.name || 'Non Assigné';
            else if (sortField === 'task_type') return pin.pdf_name ? 'Tâches sur plan' : 'Tâches générales';
            const currentSort = SORT_FIELDS.find(f => f.key === sortField);
            return `Trié par : ${currentSort?.label || 'Défaut'}`;
        };
        return groupBy(filteredPins, groupByKey);
    }, [filteredPins, sortField]);

    const sections = useMemo(() => Object.entries(groupedPins).map(([title, data]) => ({ title, data })), [groupedPins]);

    const handleNavigateToMetadata = useCallback((pinId) => {
        navigation.navigate("PinMetadataScreen", { pinId, from: 'Tasks', photoUris: JSON.stringify([]) });
    }, [navigation]);

    const hasActiveFilter = useMemo(() => (
        overdue || dateActive || categoryActive || activeStatuses.length > 0 ||
        planActive || assignedToActive || tagActive || !!searchTerm
    ), [overdue, dateActive, categoryActive, activeStatuses, planActive, assignedToActive, tagActive, searchTerm]);

    const SortBottomSheet = () => {
        const handleSelectSort = (fieldKey, direction) => {
            setSortField(fieldKey);
            setSortDirection(direction);
            setCurrentSortIndex(SORT_FIELDS.findIndex(f => f.key === fieldKey));
            setShowSortSheet(false);
        };
        return (
            <Modal animationType="slide" transparent  visible={showSortSheet} onRequestClose={() => setShowSortSheet(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
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
                                            <Feather name="check" size={18} color="#2C4F91" style={{ marginLeft: 'auto' }} />
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
                                            <Feather name="check" size={18} color="#2C4F91" style={{ marginLeft: 'auto' }} />
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
            <ScreenHeader
                style={{ marginHorizontal: -16 }}
                title="Tâches"
                subtitle={headerSubtitle}
                right={
                    <>
                        <HeaderButton label="Trier les tâches" onPress={handleOpenSortSheet}>
                            <ArrowDownNarrowWideIcon size={19} color={C.encre} strokeWidth={1.9} />
                        </HeaderButton>
                        <HeaderButton label="Nouvel élément" dark onPress={() => { setNewNature(natureFilter ?? 'tache'); setShowCreateTaskModal(true); }}>
                            <Plus size={20} color={C.blanc} strokeWidth={2.2} />
                        </HeaderButton>
                    </>
                }
            />
            {/* Search bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: C.filet, paddingHorizontal: 12, marginBottom: 10 }}>
                <Feather name="search" size={20} color="#999" style={{ marginRight: 8 }} />
                <TextInput
                    placeholder="Rechercher par nom"
                    value={searchTerm}
                    onChangeText={updateSearch}
                    style={{ flex: 1, paddingVertical: 10, fontFamily: 'Outfit_400Regular' }}
                    placeholderTextColor="#999"
                />
            </View>

            {/* Nature : réserves, tâches, observations */}
            <Segmented
                value={natureFilter ?? 'all'}
                options={[{ value: 'all', label: 'Tout' }, ...Object.entries(PIN_TYPES).map(([value, t]) => ({ value, label: t.plural }))]}
                onChange={(v) => setNatureFilter(v === 'all' ? null : v)}
                style={{ marginBottom: 10 }}
            />

            {/* Select all row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <AppCheckbox
                    checked={selectedIds.size === filteredPins.length && filteredPins.length > 0}
                    onPress={toggleSelectAll}
                />
                <Text style={{ fontSize: 15, color: '#1C1C1A', fontFamily: 'Outfit_500Medium', marginLeft: 8 }}>
                    Tout sélectionner
                </Text>
                {natureFilter && filteredPins.length > 0 && selectedIds.size === 0 && (
                    <TouchableOpacity
                        onPress={() => { setReportWholeTab(true); setShowReportModal(true); }}
                        disabled={isDownloading}
                        style={styles.kindReportBtn}
                        accessibilityRole="button"
                    >
                        {isDownloading
                            ? <ActivityIndicator size="small" color={C.encre} />
                            : <Feather name="file-text" size={14} color={C.encre} />}
                        <Text style={styles.kindReportText}>
                            {isDownloading ? 'Génération…' : REPORT_KINDS[kindForPinType(natureFilter)].label}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <TasksSkeleton />
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
                            !isFirstItem && styles.listCardNoShadow,
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
                    ListFooterComponent={() => <View style={{ height: 100 }} />}
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
                        <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                        <OverdueFilter active={overdue} onToggle={setOverdue} />
                        <DateFilter active={dateActive} onToggle={setDateActive} tags={dateTags} setTags={setDateTags} />
                        <CategoryFilter active={categoryActive} onToggle={setCategoryActive} tags={categoryTags} setTags={setCategoryTags} />
                        <StatusFilter activeStatuses={activeStatuses} setActiveStatuses={setActiveStatuses} selectedProject={projects} />
                        <TagFilter active={tagActive} onToggle={setTagActive} selectedTags={selectedTagIds} setSelectedTags={setSelectedTagIds} />
                        <PlanFilter active={planActive} onToggle={setPlanActive} selectedPlans={selectedPlans} setSelectedPlans={setSelectedPlans} />
                        <AssignedToFilter active={assignedToActive} onToggle={setAssignedToActive} selectedMembers={selectedAssignees} setSelectedMembers={setSelectedAssignees} />
                        <ArchivedFilter active={showArchived} onToggle={setShowArchived} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <SortBottomSheet />

            {/* ── Report Options Modal ── */}
           <ReportOptionsModal
    visible={showReportModal}
    onClose={() => { setShowReportModal(false); setReportWholeTab(false); }}
    onConfirm={handleGenerateReport}
    reportKind={reportKind}
    onKindChange={setReportKind}
    itemCount={reportWholeTab ? filteredPins.length : selectedIds.size}
    availableTemplates={kindTemplates}
    selectedTemplate={selectedTemplate}
    setSelectedTemplate={setSelectedTemplate}
    projectMembers={projectMembers}
    projectId={projects?.id}
    defaultLotNames={categoryActive ? categoryTags : []}
/>

            {/* Create task modal */}
            <Modal animationType="slide" transparent visible={showCreateTaskModal} onRequestClose={() => setShowCreateTaskModal(false)}>
                
                    <View style={styles.modalOverlay}>
                        <View style={[styles.createTaskContainer, { paddingBottom: Math.max(insets.bottom, 20), marginBottom: createTaskKeyboardOffset, }]}>
                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>{newNature === 'reserve' ? 'Nouvelle réserve' : newNature === 'observation' ? 'Nouvelle observation' : 'Nouvelle tâche'}</Text>
                                <TouchableOpacity onPress={() => setShowCreateTaskModal(false)}>
                                    <Feather name="x" size={24} color="#333" />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={styles.createTaskForm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                <Segmented
                                    value={newNature}
                                    options={Object.entries(PIN_TYPES).map(([value, t]) => ({ value, label: t.label }))}
                                    onChange={setNewNature}
                                    style={{ marginBottom: 14 }}
                                />
                                <Text style={styles.inputLabel}>Nom *</Text>
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
                                    <Feather name="info" size={16} color="#2C4F91" />
                                    <Text style={styles.infoText}>
                                        Cette tâche n'est pas liée à un plan. Vous pourrez ajouter plus de détails après la création.
                                    </Text>
                                </View>
                            </ScrollView>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowCreateTaskModal(false)}>
                                    <Text style={styles.cancelButtonText}>Annuler</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.createButton, (!newTaskName.trim() || isCreatingTask) && styles.createButtonDisabled]}
                                    onPress={handleCreateGeneralTask}
                                    disabled={!newTaskName.trim() || isCreatingTask}
                                >
                                    {isCreatingTask ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.createButtonText}>Créer</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                
            </Modal>

            {/* Floating buttons */}
            <View style={styles.floatingBar}>
                {selectedIds.size > 0 && (
                    <TouchableOpacity
                        style={styles.downloadFloatingBtn}
                        onPress={() => setShowReportModal(true)}
                        disabled={isDownloading}
                    >
                        {isDownloading ? (
                            <>
                                <ActivityIndicator size="small" color="white" />
                                <Text style={styles.downloadText}>Génération…</Text>
                            </>
                        ) : (
                            <>
                                <Feather name="download-cloud" size={16} color="white" />
                                <Text style={styles.downloadText}>Rapport PDF</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.filterFloatingBtn} onPress={() => setShowFilterPanel(true)}>
                    <ListFilter size={18} color="black" />
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
    container: { flex: 1, backgroundColor: '#F8F8F6', paddingHorizontal: 16, paddingBottom: 16 },
    sectionHeaderWrapper: { paddingBottom: 6, paddingTop: 16, paddingHorizontal: 0, backgroundColor: '#F8F8F6' },
    groupDateText: { fontSize: 13, color: '#5B5B56', fontFamily: 'Outfit_600SemiBold', textTransform: 'uppercase' },
    listCardWrapper: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 2, height: 2 }, shadowRadius: 6, elevation: 0, marginBottom: 1 },
    listCardNoShadow: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    sectionTopRadius: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sectionBottomRadius: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, marginBottom: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    filterContainer: { backgroundColor: 'white', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#1C1C1A' },
    subtitle: { fontSize: 12, color: '#5B5B56', fontFamily: 'Outfit_400Regular', marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    clearText: { color: 'darkmagenta', fontSize: 14, fontFamily: 'Outfit_400Regular', marginRight: 12 },
    closeIcon: { padding: 4 },
    bottomSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, maxHeight: '70%', width: '100%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sheetTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },
    sortFieldTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#333', marginTop: 15, marginBottom: 5 },
    sortItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F8F8F6', marginTop: 5 },
    sortItemActive: { backgroundColor: '#EDF1F8', borderWidth: 1, borderColor: '#CDD8EA' },
    sortText: { fontSize: 15, color: '#333', fontFamily: 'Outfit_400Regular', marginLeft: 5 },
    floatingBar: { position: 'absolute', bottom: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
    filterFloatingBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D3D3CE', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 4 },
    kindReportBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: C.filet, backgroundColor: C.blanc },
    kindReportText: { fontSize: 13, color: C.encre, fontFamily: 'Outfit_500Medium' },
    downloadFloatingBtn: { backgroundColor: '#1C1C1A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48, borderRadius: 24, gap: 6, elevation: 4 },
    downloadText: { color: 'white', fontFamily: 'Outfit_600SemiBold', fontSize: 13 },
    createTaskContainer: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, maxHeight: '80%', width: '100%' },
    createTaskForm: { marginTop: 20, marginBottom: 20 },
    inputLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#33332F', marginBottom: 8, marginTop: 16 },
    textInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827' },
    textAreaInput: { minHeight: 100, textAlignVertical: 'top' },
    infoBox: { flexDirection: 'row', backgroundColor: '#EDF1F8', padding: 12, borderRadius: 8, marginTop: 16, gap: 8 },
    infoText: { flex: 1, fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#2C4F91', lineHeight: 18 },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
    modalButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    cancelButton: { backgroundColor: '#F3F3F0' },
    cancelButtonText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#33332F' },
    createButton: { backgroundColor: '#2C4F91' },
    createButtonDisabled: { backgroundColor: '#D3D3CE' },
    createButtonText: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#FFFFFF' },
    filterActiveBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#2F6B4A', borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    filterActiveBadgeText: { color: 'white', fontSize: 10, fontFamily: 'Outfit_600SemiBold' },
    skeletonGroup: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 2, height: 2 },
    shadowRadius: 6,
},
skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
},
});