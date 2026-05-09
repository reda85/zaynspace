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
    ActivityIndicator, Alert,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    SectionList,
    StyleSheet,
    Switch,
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

import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

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

const CustomCheckbox = ({ checked, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
            width: 22, height: 22, borderRadius: 6, borderWidth: 2,
            borderColor: checked ? 'darkmagenta' : '#D1D5DB',
            backgroundColor: checked ? 'darkmagenta' : 'white',
            alignItems: 'center', justifyContent: 'center',
        }}
    >
        {checked && <Feather name="check" size={13} color="white" />}
    </TouchableOpacity>
);

const AppCheckbox = ({ checked, onPress }) => {
    if (Platform.OS === 'android') {
        return <Checkbox status={checked ? 'checked' : 'unchecked'} color="darkmagenta" onPress={onPress} />;
    }
    return <CustomCheckbox checked={checked} onPress={onPress} />;
};

// ─── FIELD LABELS ────────────────────────────────────────────────────────────
const FIELD_LABELS = {
    description: 'Description',
    photos: 'Photos',
    snapshot: 'Snapshot du plan',
    assignedTo: 'Assigné à',
    dueDate: 'Échéance',
    category: 'Catégorie',
    status: 'Statut',
};

// ─── REPORT OPTIONS MODAL ────────────────────────────────────────────────────
// Au top du fichier, ajoute ces imports si pas déjà présents
// supabase est déjà importé chez toi

// ── Helper: convert plain text (with bullets) to TipTap doc JSON ─────────────
const plainTextToTipTapDoc = (text) => {
    if (!text || !text.trim()) {
        return { type: 'doc', content: [{ type: 'paragraph' }] };
    }
    const lines = text.split('\n');
    const blocks = [];
    let bulletBuffer = [];

    const flushBullets = () => {
        if (bulletBuffer.length === 0) return;
        blocks.push({
            type: 'bulletList',
            content: bulletBuffer.map((line) => ({
                type: 'listItem',
                content: [{
                    type: 'paragraph',
                    content: line ? [{ type: 'text', text: line }] : [],
                }],
            })),
        });
        bulletBuffer = [];
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        const isBullet = /^[-•▪➢➤◦*]\s*/.test(line);
        if (isBullet) {
            bulletBuffer.push(line.replace(/^[-•▪➢➤◦*]\s*/, ''));
        } else {
            flushBullets();
            if (line) {
                blocks.push({
                    type: 'paragraph',
                    content: [{ type: 'text', text: line }],
                });
            } else {
                blocks.push({ type: 'paragraph' });
            }
        }
    }
    flushBullets();
    if (blocks.length === 0) blocks.push({ type: 'paragraph' });
    return { type: 'doc', content: blocks };
};

// ── Helper: upload local image URIs to Supabase Storage ──────────────────────
const uploadPlanningImages = async (images, projectId) => {
    const urls = [];
    for (const img of images) {
        const ext = (img.uri.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `planning/${projectId}/${fileName}`;

        const response = await fetch(img.uri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error } = await supabase.storage
            .from('reports')
            .upload(path, arrayBuffer, {
                contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                upsert: false,
            });

        if (error) throw error;

        const { data } = supabase.storage.from('reports').getPublicUrl(path);
        urls.push(data.publicUrl);
    }
    return urls;
};


// ─── REPORT OPTIONS MODAL ────────────────────────────────────────────────────
function ReportOptionsModal({
    visible,
    onClose,
    onConfirm,
    availableTemplates,
    selectedTemplate,
    setSelectedTemplate,
    projectMembers,
    projectId,             // ── NEW: needed for storage upload path
}) {
    const insets = useSafeAreaInsets();

    const [reportTitle, setReportTitle] = useState('');                          // ── NEW
    const [displayMode, setDisplayMode] = useState('list');
    const [fields, setFields] = useState({
        description: true, photos: true, snapshot: true, assignedTo: true,
        dueDate: true, category: true, status: true,
    });
    const [participants, setParticipants] = useState([]);
    const [customSectionContents, setCustomSectionContents] = useState([]);
    const [planningImages, setPlanningImages] = useState([]);                    // ── NEW
    const [planningObservationsText, setPlanningObservationsText] = useState(''); // ── NEW
    const [isSubmitting, setIsSubmitting] = useState(false);                     // ── NEW
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    // ── Keyboard listeners (unchanged) ───────────────────────────────────────
    useEffect(() => {
        if (!visible) return;
        const show = Keyboard.addListener(
            Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
            (e) => setKeyboardOffset(e.endCoordinates.height)
        );
        const hide = Keyboard.addListener(
            Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
            () => setKeyboardOffset(0)
        );
        return () => { show.remove(); hide.remove(); };
    }, [visible]);

    useEffect(() => {
        if (!visible) setKeyboardOffset(0);
    }, [visible]);

    // ── Sync state when template changes (extended) ──────────────────────────
    useEffect(() => {
        if (!visible) return;
        const cfg = selectedTemplate?.config;
        setReportTitle(cfg?.reportTitle || 'RAPPORT DE TÂCHES');                 // ── NEW
        setDisplayMode(cfg?.tasks?.displayMode || 'list');
        if (cfg?.fields) {
            setFields({
                description: cfg.fields.description ?? true,
                photos: cfg.fields.photos ?? true,
                snapshot: cfg.fields.snapshot ?? true,
                assignedTo: cfg.fields.assignedTo ?? true,
                dueDate: cfg.fields.dueDate ?? true,
                category: cfg.fields.category ?? true,
                status: cfg.fields.status ?? true,
            });
        } else {
            setFields({ description: true, photos: true, snapshot: true, assignedTo: true, dueDate: true, category: true, status: true });
        }
        setParticipants(projectMembers.map(m => ({ ...m, present: true })));
        const enabled = (cfg?.customSections || []).filter(s => s.enabled);
        setCustomSectionContents(enabled.map(s => ({ id: s.id, title: s.title, content: '' })));
        // ── NEW: reset planning state on template change
        setPlanningImages([]);
        setPlanningObservationsText('');
    }, [visible, selectedTemplate, projectMembers]);

    // Defensive normalization for planning block (older templates may not have it)
    const templateConfig = useMemo(() => {                                        // ── NEW
        const raw = selectedTemplate?.config;
        if (!raw) return null;
        return {
            ...raw,
            planning: {
                enabled: false,
                title: 'Pointage de planning',
                imagesPerPage: 1,
                fitMode: 'contain',
                showObservations: true,
                observationsTitle: 'Retards et observations',
                ...(raw.planning || {}),
            },
        };
    }, [selectedTemplate]);

    const showParticipants =
        templateConfig?.participants?.enabled === true ||
        templateConfig?.coverPage?.showParticipants === true;
    const participantsConfig = templateConfig?.participants || {};
    const enabledSections = (templateConfig?.customSections || []).filter(s => s.enabled);
    const planningEnabled = templateConfig?.planning?.enabled === true;          // ── NEW

    const toggleField = (key) => setFields(f => ({ ...f, [key]: !f[key] }));
    const toggleParticipant = (id) =>
        setParticipants(prev => prev.map(p => p.id === id ? { ...p, present: !p.present } : p));
    const updateSectionContent = (id, content) =>
        setCustomSectionContents(prev => prev.map(s => s.id === id ? { ...s, content } : s));

    // ── NEW: Planning image handlers ─────────────────────────────────────────
    const pickPlanningImages = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission refusée', "Autorisez l'accès à vos photos pour ajouter des captures de planning.");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            quality: 0.85,
        });
        if (result.canceled) return;
        const newImages = result.assets.map((asset) => ({
            uri: asset.uri,
            name: asset.fileName || asset.uri.split('/').pop() || 'planning.jpg',
        }));
        setPlanningImages((prev) => [...prev, ...newImages]);
    };

    const removePlanningImage = (i) =>
        setPlanningImages((prev) => prev.filter((_, idx) => idx !== i));

    const movePlanningImage = (i, dir) => {
        setPlanningImages((prev) => {
            const next = [...prev];
            const target = i + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[i], next[target]] = [next[target], next[i]];
            return next;
        });
    };

    // ── NEW: Submit with payload assembly ────────────────────────────────────
    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            // 1. Upload planning images if any
            let planningImageUrls = [];
            if (planningImages.length > 0) {
                planningImageUrls = await uploadPlanningImages(planningImages, projectId);
            }

            // 2. Convert plain text observations + custom sections to TipTap docs
            const planningObservations = plainTextToTipTapDoc(planningObservationsText);
            const customSections = {};
            customSectionContents.forEach(s => {
                customSections[s.id] = plainTextToTipTapDoc(s.content);
            });

            // 3. Pass everything to parent
            await onConfirm({
                reportTitle,
                displayMode,
                fields,
                participants,
                customSections,
                planningImages: planningImageUrls,
                planningObservations,
            });
        } catch (err) {
            console.error('Report generation failed:', err);
            Alert.alert('Erreur', err.message || 'La génération du rapport a échoué.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={rm.overlay}>
                <View style={[
                    rm.sheet,
                    {
                        paddingBottom: Math.max(insets.bottom, 20),
                        marginBottom: keyboardOffset,
                    }
                ]}>

                    {/* Header */}
                    <View style={rm.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={rm.title}>Options du rapport</Text>
                            {templateConfig?.reportTitle && (
                                <Text style={rm.subtitle}>{templateConfig.reportTitle}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} style={rm.closeBtn} disabled={isSubmitting}>
                            <Feather name="x" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                        {/* Template selector (unchanged) */}
                        {availableTemplates.length > 0 && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>MODÈLE DE RAPPORT</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                    <TouchableOpacity
                                        onPress={() => setSelectedTemplate(null)}
                                        style={[rm.templateChip, !selectedTemplate && rm.templateChipActive]}
                                    >
                                        <Text style={[rm.templateChipText, !selectedTemplate && rm.templateChipTextActive]}>
                                            Par défaut
                                        </Text>
                                    </TouchableOpacity>
                                    {availableTemplates.map(t => (
                                        <TouchableOpacity
                                            key={t.id}
                                            onPress={() => setSelectedTemplate(t)}
                                            style={[rm.templateChip, selectedTemplate?.id === t.id && rm.templateChipActive]}
                                        >
                                            <Text style={[rm.templateChipText, selectedTemplate?.id === t.id && rm.templateChipTextActive]}>
                                                {t.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* ── NEW: Titre du rapport ── */}
                        <View style={rm.section}>
                            <Text style={rm.sectionLabel}>TITRE DU RAPPORT</Text>
                            <TextInput
                                value={reportTitle}
                                onChangeText={setReportTitle}
                                placeholder="RAPPORT DE TÂCHES"
                                placeholderTextColor="#D1D5DB"
                                style={rm.titleInput}
                            />
                            <Text style={rm.modeHint}>
                                Apparaîtra sur la couverture et dans le résumé du rapport.
                            </Text>
                        </View>

                        {/* Display mode (unchanged) */}
                        <View style={rm.section}>
                            <Text style={rm.sectionLabel}>MODE D'AFFICHAGE</Text>
                            <View style={rm.modeRow}>
                                <TouchableOpacity
                                    style={[rm.modeBtn, displayMode === 'list' && rm.modeBtnActive]}
                                    onPress={() => setDisplayMode('list')}
                                >
                                    <Feather name="list" size={15} color={displayMode === 'list' ? '#fff' : '#6B7280'} />
                                    <Text style={[rm.modeBtnText, displayMode === 'list' && rm.modeBtnTextActive]}>
                                        Liste détaillée
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[rm.modeBtn, displayMode === 'table' && rm.modeBtnActive]}
                                    onPress={() => setDisplayMode('table')}
                                >
                                    <Feather name="grid" size={15} color={displayMode === 'table' ? '#fff' : '#6B7280'} />
                                    <Text style={[rm.modeBtnText, displayMode === 'table' && rm.modeBtnTextActive]}>
                                        Tableau compact
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={rm.modeHint}>
                                {displayMode === 'list'
                                    ? 'Affichage détaillé avec snapshots et photos'
                                    : "Vue tableau compacte idéale pour l'impression"}
                            </Text>
                        </View>

                        {/* Fields (unchanged) */}
                        <View style={rm.section}>
                            <Text style={rm.sectionLabel}>CHAMPS À INCLURE</Text>
                            {Object.entries(fields).map(([key, val]) => (
                                <TouchableOpacity
                                    key={key}
                                    onPress={() => toggleField(key)}
                                    style={rm.fieldRow}
                                    activeOpacity={0.7}
                                >
                                    <View style={[rm.fieldCheck, val && rm.fieldCheckActive]}>
                                        {val && <Feather name="check" size={11} color="#fff" />}
                                    </View>
                                    <Text style={rm.fieldLabel}>{FIELD_LABELS[key]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Participants (unchanged) */}
                        {showParticipants && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>
                                    {(participantsConfig.title || 'PARTICIPANTS').toUpperCase()}
                                </Text>
                                {participants.length === 0 ? (
                                    <Text style={rm.emptyText}>Aucun membre trouvé sur ce projet.</Text>
                                ) : (
                                    <View style={rm.participantsList}>
                                        {participants.map((member, idx) => (
                                            <View
                                                key={member.id}
                                                style={[
                                                    rm.participantRow,
                                                    idx < participants.length - 1 && rm.participantRowBorder,
                                                ]}
                                            >
                                                <View style={rm.participantAvatar}>
                                                    <Text style={rm.participantAvatarText}>
                                                        {(member.name || '?').charAt(0).toUpperCase()}
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={rm.participantName}>{member.name || '—'}</Text>
                                                    {participantsConfig.showRoles && member.role && (
                                                        <Text style={rm.participantRole}>{member.role}</Text>
                                                    )}
                                                    {participantsConfig.showContact && member.email && (
                                                        <Text style={rm.participantEmail}>{member.email}</Text>
                                                    )}
                                                </View>
                                                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                                    <Text style={[rm.presenceLabel, member.present && rm.presenceLabelActive]}>
                                                        {member.present ? 'Présent' : 'Absent'}
                                                    </Text>
                                                    <Switch
                                                        value={member.present}
                                                        onValueChange={() => toggleParticipant(member.id)}
                                                        trackColor={{ false: '#E5E7EB', true: '#111827' }}
                                                        thumbColor="#fff"
                                                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                                    />
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        {/* ── NEW: Planning section ── */}
                        {planningEnabled && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>
                                    {(templateConfig.planning.title || 'PLANNING').toUpperCase()}
                                </Text>

                                {/* Image list */}
                                {planningImages.length > 0 && (
                                    <View style={{ gap: 8, marginTop: 4, marginBottom: 12 }}>
                                        {planningImages.map((img, i) => (
                                            <View key={`${img.uri}-${i}`} style={rm.planningImageRow}>
                                                <Image source={{ uri: img.uri }} style={rm.planningThumb} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={rm.planningImageName} numberOfLines={1}>
                                                        {img.name}
                                                    </Text>
                                                    <Text style={rm.planningImagePage}>Page {i + 1}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => movePlanningImage(i, -1)}
                                                    disabled={i === 0}
                                                    style={rm.iconBtn}
                                                >
                                                    <Feather name="arrow-up" size={14} color={i === 0 ? '#D1D5DB' : '#374151'} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => movePlanningImage(i, 1)}
                                                    disabled={i === planningImages.length - 1}
                                                    style={rm.iconBtn}
                                                >
                                                    <Feather name="arrow-down" size={14} color={i === planningImages.length - 1 ? '#D1D5DB' : '#374151'} />
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => removePlanningImage(i)} style={rm.iconBtn}>
                                                    <Feather name="x" size={16} color="#DC2626" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Upload button */}
                                <TouchableOpacity style={rm.uploadBtn} onPress={pickPlanningImages}>
                                    <Feather name="upload-cloud" size={18} color="#374151" />
                                    <Text style={rm.uploadText}>Ajouter des captures de planning</Text>
                                </TouchableOpacity>
                                <Text style={rm.modeHint}>
                                    {templateConfig.planning.imagesPerPage === 2 ? '2 images par page' : '1 image par page'}
                                </Text>

                                {/* Observations text */}
                                {templateConfig.planning.showObservations && (
                                    <View style={{ marginTop: 16 }}>
                                        <Text style={rm.customSectionTitle}>
                                            {templateConfig.planning.observationsTitle || 'Retards et observations'}
                                        </Text>
                                        <TextInput
                                            value={planningObservationsText}
                                            onChangeText={setPlanningObservationsText}
                                            placeholder={'- Retard sur le lot Gros-Œuvre\n- Étanchéité à entamer\n- ...'}
                                            placeholderTextColor="#D1D5DB"
                                            multiline
                                            numberOfLines={4}
                                            textAlignVertical="top"
                                            style={[rm.customSectionInput, { marginTop: 6 }]}
                                        />
                                        <Text style={rm.customSectionHint}>
                                            Une ligne par observation. Préfixez avec - ou • pour les puces.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Custom sections (lightly updated — no more type label) */}
                        {enabledSections.length > 0 && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>SECTIONS ADDITIONNELLES</Text>
                                {customSectionContents.map(section => (
                                    <View key={section.id} style={{ marginBottom: 16 }}>
                                        <Text style={rm.customSectionTitle}>{section.title}</Text>
                                        <TextInput
                                            value={section.content}
                                            onChangeText={t => updateSectionContent(section.id, t)}
                                            placeholder={`Contenu de "${section.title}"…`}
                                            placeholderTextColor="#D1D5DB"
                                            multiline
                                            numberOfLines={4}
                                            textAlignVertical="top"
                                            style={[rm.customSectionInput, { marginTop: 6 }]}
                                        />
                                        <Text style={rm.customSectionHint}>
                                            Préfixez une ligne avec - ou • pour créer une puce.
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View style={{ height: 8 }} />
                    </ScrollView>

                    {/* Footer */}
                    <View style={rm.footer}>
                        <TouchableOpacity onPress={onClose} style={rm.cancelBtn} disabled={isSubmitting}>
                            <Text style={rm.cancelBtnText}>Annuler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleConfirm}
                            style={[rm.confirmBtn, isSubmitting && { opacity: 0.6 }]}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <ActivityIndicator color="#fff" size="small" />
                                    <Text style={rm.confirmBtnText}>Génération…</Text>
                                </>
                            ) : (
                                <>
                                    <Feather name="download-cloud" size={15} color="#fff" />
                                    <Text style={rm.confirmBtnText}>Générer PDF</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
// ─── REPORT MODAL STYLES ─────────────────────────────────────────────────────
const rm = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 20,
        maxHeight: '90%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontFamily: 'Outfit_700Bold',
        color: '#111827',
    },
    subtitle: {
        fontSize: 12,
        fontFamily: 'Outfit_400Regular',
        color: '#9CA3AF',
        marginTop: 2,
    },
    closeBtn: {
        padding: 4,
        marginTop: 2,
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontSize: 10,
        fontFamily: 'Outfit_600SemiBold',
        color: '#9CA3AF',
        letterSpacing: 1,
        marginBottom: 10,
    },
    // Template chips
    templateChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
        marginRight: 8,
    },
    templateChipActive: {
        backgroundColor: '#111827',
        borderColor: '#111827',
    },
    templateChipText: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#6B7280',
    },
    templateChipTextActive: {
        color: '#fff',
    },
    // Display mode
    modeRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    modeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    modeBtnActive: {
        backgroundColor: '#111827',
        borderColor: '#111827',
    },
    modeBtnText: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#6B7280',
    },
    modeBtnTextActive: {
        color: '#fff',
    },
    modeHint: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#9CA3AF',
        marginTop: 6,
    },
    // Fields
    fieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 9,
        paddingHorizontal: 4,
    },
    fieldCheck: {
        width: 18,
        height: 18,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: '#D1D5DB',
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fieldCheckActive: {
        backgroundColor: '#111827',
        borderColor: '#111827',
    },
    fieldLabel: {
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        color: '#374151',
    },
    // Participants
    emptyText: {
        fontSize: 12,
        fontFamily: 'Outfit_400Regular',
        color: '#D1D5DB',
        marginTop: 4,
    },
    participantsList: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 8,
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
    },
    participantRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    participantAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    participantAvatarText: {
        fontSize: 12,
        fontFamily: 'Outfit_600SemiBold',
        color: '#4B5563',
    },
    participantName: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#111827',
    },
    participantRole: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#9CA3AF',
    },
    participantEmail: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#D1D5DB',
    },
    presenceLabel: {
        fontSize: 11,
        fontFamily: 'Outfit_500Medium',
        color: '#D1D5DB',
    },
    presenceLabelActive: {
        color: '#10B981',
    },
    // Custom sections
    customSectionTitle: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#374151',
    },
    customSectionType: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#D1D5DB',
    },
    customSectionInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        color: '#111827',
        backgroundColor: '#F9FAFB',
        minHeight: 80,
    },
    customSectionHint: {
        fontSize: 10,
        fontFamily: 'Outfit_400Regular',
        color: '#D1D5DB',
        marginTop: 4,
    },
    // Footer
    footer: {
        flexDirection: 'row',
        gap: 10,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        marginTop: 4,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: {
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#374151',
    },
    confirmBtn: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderRadius: 10,
        backgroundColor: '#111827',
    },
    confirmBtnText: {
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#fff',
    },
    // ── NEW: Title input
    titleInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#111827',
        backgroundColor: '#F9FAFB',
        marginTop: 4,
    },
    // ── NEW: Planning images
    planningImageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F9FAFB',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    planningThumb: {
        width: 56,
        height: 42,
        borderRadius: 4,
        backgroundColor: '#E5E7EB',
    },
    planningImageName: {
        fontSize: 12,
        fontFamily: 'Outfit_500Medium',
        color: '#111827',
    },
    planningImagePage: {
        fontSize: 10,
        fontFamily: 'Outfit_400Regular',
        color: '#9CA3AF',
        marginTop: 2,
    },
    iconBtn: { padding: 6 },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#D1D5DB',
        borderStyle: 'dashed',
        backgroundColor: '#F9FAFB',
        marginTop: 4,
    },
    uploadText: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#374151',
    },
});


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

    // ── Fetch templates ──
    useEffect(() => {
        if (!projects?.organization_id) return;
        const fetchTemplates = async () => {
            const { data } = await supabase
                .from('report_templates')
                .select('*')
                .eq('organization_id', projects.organization_id)
                .order('created_at', { ascending: false });
            if (data) {
                setAvailableTemplates(data);
                const defaultTemplate = data.find(t => t.is_default) || data[0] || null;
                setSelectedTemplate(defaultTemplate);
            }
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
    reportTitle,
    displayMode,
    fields,
    participants,
    customSections,
    planningImages,
    planningObservations,
}) => {
    if (selectedIds.size === 0 || isDownloading) return;
    setShowReportModal(false);
    setIsDownloading(true);
    try {
        const requestBody = {
            projectId: projects.id,
            selectedIds: Array.from(selectedIds),
            fields,
            displayMode,
            templateConfig: selectedTemplate?.config || null,
            reportTitle,
            participants,
            customSections,
            planningImages,
            planningObservations,
        };

        const { data: { session } } = await supabase.auth.getSession();
        const apiUrl = "https://zaynbackend-production.up.railway.app/api/report";

        console.log('🚀 Requesting PDF generation...');
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            Alert.alert('Erreur API', `${response.status}\n${errorText.substring(0, 200)}`);
            return;
        }

        // ── Backend now returns JSON with a signed download URL ──
        const json = await response.json();
        const { downloadUrl, fileName: serverFileName, fileSize } = json;

        if (!downloadUrl) {
            Alert.alert('Erreur', 'URL de téléchargement manquante dans la réponse');
            return;
        }

        const sizeMB = fileSize ? (fileSize / 1024 / 1024).toFixed(2) : '?';
        console.log(`📥 Streaming PDF download: ${sizeMB} MB`);

        const dateString = new Date().toISOString().substring(0, 10).replace(/-/g, '');
        const projectName = projects?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Export';
        const fileName = serverFileName || `Rapport_${projectName}_${dateString}.pdf`;
        const fileUri = FileSystem.documentDirectory + fileName;

        // ── Native streaming download — zero JS memory usage ──
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);

        if (downloadResult.status !== 200) {
            Alert.alert('Erreur', `Téléchargement échoué (HTTP ${downloadResult.status})`);
            return;
        }

        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists || fileInfo.size === 0) {
            Alert.alert('Erreur', "Le fichier n'a pas été enregistré correctement.");
            return;
        }

        console.log(`✅ Saved: ${fileInfo.size} bytes`);

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
                mimeType: 'application/pdf',
                dialogTitle: 'Partager le rapport PDF',
                UTI: 'com.adobe.pdf',
            });
        } else {
            Alert.alert('Succès', `Rapport sauvegardé: ${fileName}`);
        }

        setSelectedIds(new Set());
    } catch (error) {
        console.error('PDF generation error:', error);
        Alert.alert('Erreur', error.message || 'Erreur inconnue lors de la génération');
    } finally {
        setIsDownloading(false);
    }
}, [selectedIds, projects, isDownloading, selectedTemplate]);

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
                        backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
                        alignItems: 'center', justifyContent: 'center',
                        shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
                    }}>
                        <Feather name="arrow-left" size={20} color="#000" />
                    </View>
                </TouchableOpacity>
            ),
            headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 16 }}>
                    <TouchableOpacity onPress={handleOpenSortSheet}>
                        <View style={{
                            backgroundColor: 'white', width: 36, height: 36, borderRadius: 18,
                            alignItems: 'center', justifyContent: 'center',
                            shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
                        }}>
                            <ArrowDownNarrowWideIcon size={20} color="#000" />
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowCreateTaskModal(true)}>
                        <View style={{
                            backgroundColor: '#6D28D9', width: 36, height: 36, borderRadius: 18,
                            alignItems: 'center', justifyContent: 'center',
                            shadowColor: '#000', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 2,
                        }}>
                            <Plus size={20} color="#FFF" />
                        </View>
                    </TouchableOpacity>
                </View>
            ),
            headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: 'black' },
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
    }, [pins, searchTerm, createdByMe, activeStatuses, overdue, dateActive, dateTags, loggedInUser, categoryActive, planActive, selectedPlans, categoryTags, assignedToActive, selectedAssignees, tagActive, selectedTagIds, showArchived, sortPins]);

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
            <Modal animationType="slide" transparent visible={showSortSheet} onRequestClose={() => setShowSortSheet(false)}>
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
    onClose={() => setShowReportModal(false)}
    onConfirm={handleGenerateReport}
    availableTemplates={availableTemplates}
    selectedTemplate={selectedTemplate}
    setSelectedTemplate={setSelectedTemplate}
    projectMembers={projectMembers}
    projectId={projects?.id}
/>

            {/* Create task modal */}
            <Modal animationType="slide" transparent visible={showCreateTaskModal} onRequestClose={() => setShowCreateTaskModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.createTaskContainer}>
                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>Nouvelle tâche générale</Text>
                                <TouchableOpacity onPress={() => setShowCreateTaskModal(false)}>
                                    <Feather name="x" size={24} color="#333" />
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={styles.createTaskForm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
                </KeyboardAvoidingView>
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
    sectionHeaderWrapper: { paddingBottom: 6, paddingTop: 16, paddingHorizontal: 0, backgroundColor: '#F5F7FA' },
    groupDateText: { fontSize: 13, color: '#6B7280', fontFamily: 'Outfit_600SemiBold', textTransform: 'uppercase' },
    listCardWrapper: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 2, height: 2 }, shadowRadius: 6, elevation: 0, marginBottom: 1 },
    listCardNoShadow: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    sectionTopRadius: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    sectionBottomRadius: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, marginBottom: 16 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    filterContainer: { backgroundColor: 'white', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111827' },
    subtitle: { fontSize: 12, color: '#6B7280', fontFamily: 'Outfit_400Regular', marginTop: 2 },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    clearText: { color: 'darkmagenta', fontSize: 14, fontFamily: 'Outfit_400Regular', marginRight: 12 },
    closeIcon: { padding: 4 },
    bottomSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, maxHeight: '70%', width: '100%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    sheetTitle: { fontSize: 18, fontFamily: 'Outfit_700Bold', color: '#111' },
    sortFieldTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#333', marginTop: 15, marginBottom: 5 },
    sortItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f9fafb', marginTop: 5 },
    sortItemActive: { backgroundColor: '#ede9fe', borderWidth: 1, borderColor: '#c4b5fd' },
    sortText: { fontSize: 15, color: '#333', fontFamily: 'Outfit_400Regular', marginLeft: 5 },
    floatingBar: { position: 'absolute', bottom: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
    filterFloatingBtn: { backgroundColor: '#6D28D9', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 4 },
    downloadFloatingBtn: { backgroundColor: '#111827', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48, borderRadius: 24, gap: 6, elevation: 4 },
    downloadText: { color: 'white', fontFamily: 'Outfit_600SemiBold', fontSize: 13 },
    createTaskContainer: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, maxHeight: '80%', width: '100%' },
    createTaskForm: { marginTop: 20, marginBottom: 20 },
    inputLabel: { fontSize: 14, fontFamily: 'Outfit_600SemiBold', color: '#374151', marginBottom: 8, marginTop: 16 },
    textInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontFamily: 'Outfit_400Regular', color: '#111827' },
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
    filterActiveBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#10b981', borderRadius: 10, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    filterActiveBadgeText: { color: 'white', fontSize: 10, fontFamily: 'Outfit_600SemiBold' },
});