// Fenêtre de composition d'un rapport (type, modèle, titre, contenu, champs,
// participants, sections libres, planning). Utilisée par la liste des tâches
// et par la page Rapports du chantier.
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, Keyboard, Modal, Platform, ScrollView,
    StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { fetchLots, todayISO } from '../../lib/chantier';
import { Segmented } from '../chantier/ui';
import { PIN_TYPES } from '../../lib/pinTypes';
import {
    DEFAULT_PROGRESS, DISPLAY_MODES, PROGRESS_PARTS, REPORT_KIND_KEYS, REPORT_KINDS, templateKind, fieldValue,
} from '../../lib/reportKinds';

const FIELD_LABELS = {
    description: 'Description',
    photos: 'Photos',
    snapshot: 'Snapshot du plan',
    assignedTo: 'Assigné à',
    dueDate: 'Échéance',
    category: 'Lot',
    status: 'Statut',
    startDate: 'Date de début',
    progress: 'Avancement',
};

const DEFAULT_FIELDS = {
    description: true, photos: true, snapshot: true, assignedTo: true,
    startDate: false, dueDate: true, progress: false, category: true, status: true,
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
export default function ReportOptionsModal({
    visible,
    onClose,
    onConfirm,
    availableTemplates,
    selectedTemplate,
    setSelectedTemplate,
    projectMembers,
    projectId,             // ── NEW: needed for storage upload path
    reportKind = 'libre',  // type de rapport (réserves, visite, avancement, libre)
    onKindChange,
    itemCount,             // éléments concernés (affiché sous le type)
    defaultLotNames = [],  // filtre de lot de la liste : pré-sélectionne ces lots
}) {
    const insets = useSafeAreaInsets();
    const kind = REPORT_KINDS[reportKind] ?? REPORT_KINDS.libre;
    const isProgress = reportKind === 'avancement';
    const [progress, setProgress] = useState(DEFAULT_PROGRESS);

    const [reportTitle, setReportTitle] = useState('');                          // ── NEW
    const [displayMode, setDisplayMode] = useState('list');
    const [fields, setFields] = useState(DEFAULT_FIELDS);
    const [participants, setParticipants] = useState([]);
    const [customSectionContents, setCustomSectionContents] = useState([]);
    const [planningImages, setPlanningImages] = useState([]);                    // ── NEW
    const [planningObservationsText, setPlanningObservationsText] = useState(''); // ── NEW
    const [isSubmitting, setIsSubmitting] = useState(false);                     // ── NEW
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    // Rapport d'avancement : effectifs par entreprise (titulaires des lots,
    // plus celles ajoutées à la main) et recommandations.
    const [lots, setLots] = useState([]);
    const [counts, setCounts] = useState({});
    const [extraCompanies, setExtraCompanies] = useState([]);
    const [conclusionText, setConclusionText] = useState('');
    useEffect(() => {
        if (!visible || !projectId) return;
        let alive = true;
        fetchLots(projectId).then(({ lots: l }) => {
            if (!alive) return;
            setLots(l);
            const wanted = new Set(defaultLotNames.map((n) => String(n).toLowerCase()));
            setLotIds(l.filter((x) => wanted.has(String(x.name).toLowerCase())).map((x) => String(x.id)));
        }).catch(() => {});
        return () => { alive = false; };
    }, [visible, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
    // Rapport par lot(s) : vide = tout le projet.
    const [lotIds, setLotIds] = useState([]);
    const scopedLots = lots.filter((l) => lotIds.includes(String(l.id)));
    const toggleLot = (id) => setLotIds((ids) => (ids.includes(String(id)) ? ids.filter((x) => x !== String(id)) : [...ids, String(id)]));
    const lotCompanies = useMemo(() => {
        const byKey = new Map();
        for (const lot of scopedLots.length ? scopedLots : lots) {
            if (!lot.entreprises?.name) continue;
            const key = lot.entreprises.id ?? lot.entreprises.name;
            const row = byKey.get(key) ?? { key, name: lot.entreprises.name, lots: [] };
            row.lots.push(lot.name);
            byKey.set(key, row);
        }
        return [...byKey.values()].map((r) => ({ ...r, lots: r.lots.join(', ') }));
    }, [lots, lotIds]); // eslint-disable-line react-hooks/exhaustive-deps
    const totalWorkforce =
        lotCompanies.reduce((n, r) => n + (Number(counts[r.key]) || 0), 0) +
        extraCompanies.reduce((n, r) => n + (Number(r.count) || 0), 0);

   
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

    // ── Sync state when template or report type changes ─────────────────────
    useEffect(() => {
        if (!visible) return;
        const cfg = selectedTemplate?.config;
        // Le modèle donne titre, mode et champs s'il est fait pour ce type
        // (ou pour un rapport libre) ; sinon le type pose les siens.
        const own = reportKind === 'libre' || templateKind(selectedTemplate) === reportKind;
        setReportTitle((own && cfg?.reportTitle) || kind.title);
        const tplMode = cfg?.tasks?.displayMode;
        setDisplayMode(tplMode && (reportKind === 'libre' || kind.modes.includes(tplMode)) ? tplMode : kind.displayMode);
        const f = (own && cfg?.fields) || kind.fields || cfg?.fields;
        setFields(f
            ? Object.fromEntries(Object.keys(DEFAULT_FIELDS).map((k) => [k, fieldValue(f, k, DEFAULT_FIELDS[k])]))
            : DEFAULT_FIELDS);
        setProgress({ ...DEFAULT_PROGRESS, ...(cfg?.progress || {}) });
        setParticipants(projectMembers.map(m => ({ ...m, present: true })));
        const enabled = (cfg?.customSections || []).filter(s => s.enabled);
        setCustomSectionContents(enabled.map(s => ({ id: s.id, title: s.title, content: '' })));
        // ── NEW: reset planning state on template change
        setPlanningImages([]);
        setPlanningObservationsText('');
        setCounts({});
        setExtraCompanies([]);
        setConclusionText('');
    }, [visible, selectedTemplate, projectMembers, reportKind]);

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
                lotIds: scopedLots.map((l) => l.id),
                ...(isProgress ? {
                    progress,
                    progressContent: {
                        workforceDate: todayISO(),
                        workforce: [
                            ...lotCompanies.map((r) => ({ name: r.name, lots: r.lots, count: Number(counts[r.key]) || 0 })),
                            ...extraCompanies.map((r) => ({ name: r.name.trim(), lots: '', count: Number(r.count) || 0 })),
                        ].filter((r) => r.name && r.count > 0),
                        conclusion: plainTextToTipTapDoc(conclusionText),
                    },
                } : {}),
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
                            <Text style={rm.title}>{reportKind === 'libre' ? 'Options du rapport' : kind.label}</Text>
                            {itemCount != null && (
                                <Text style={rm.subtitle}>
                                    {itemCount} élément{itemCount > 1 ? 's' : ''}{kind.pinType ? ` · seules les ${PIN_TYPES[kind.pinType].label.toLowerCase()}s sont reprises` : ''}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose} style={rm.closeBtn} disabled={isSubmitting}>
                            <Feather name="x" size={20} color="#5B5B56" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                        {/* Type de rapport */}
                        {onKindChange && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>TYPE DE RAPPORT</Text>
                                <Segmented
                                    small
                                    value={reportKind}
                                    options={REPORT_KIND_KEYS.map((k) => ({ value: k, label: REPORT_KINDS[k].short }))}
                                    onChange={onKindChange}
                                    style={{ marginTop: 8 }}
                                />
                                <Text style={rm.modeHint}>{kind.hint}</Text>
                            </View>
                        )}

                        {/* Template selector */}
                        {availableTemplates.length > 0 && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>MODÈLE DE RAPPORT</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                    <TouchableOpacity
                                        onPress={() => setSelectedTemplate(null)}
                                        style={[rm.templateChip, !selectedTemplate && rm.templateChipActive]}
                                    >
                                        <Text style={[rm.templateChipText, !selectedTemplate && rm.templateChipTextActive]}>
                                            {reportKind === 'libre' ? 'Par défaut' : `Présentation ${kind.short.toLowerCase()}`}
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
                                placeholder={kind.title}
                                placeholderTextColor="#D3D3CE"
                                style={rm.titleInput}
                            />
                            <Text style={rm.modeHint}>
                                Apparaîtra sur la couverture et dans le résumé du rapport.
                            </Text>
                        </View>

                        {/* Rapport par lot(s) */}
                        {lots.length > 0 && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>LOTS CONCERNÉS</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {[{ id: null, name: 'Tout le projet' }, ...lots].map((l) => {
                                        const on = l.id == null ? scopedLots.length === 0 : lotIds.includes(String(l.id));
                                        return (
                                            <TouchableOpacity
                                                key={l.id ?? 'all'}
                                                onPress={() => (l.id == null ? setLotIds([]) : toggleLot(l.id))}
                                                style={[rm.lotChip, on && rm.modeBtnActive]}
                                                accessibilityState={{ selected: on }}
                                            >
                                                <Text style={[rm.modeBtnText, on && rm.modeBtnTextActive]}>{l.name}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <Text style={rm.modeHint}>
                                    {scopedLots.length
                                        ? `Seuls les éléments de ${scopedLots.length > 1 ? 'ces lots' : 'ce lot'} sont repris. En page de garde : ${scopedLots.map((l) => l.name).join(' / ')}${(() => { const c = [...new Set(scopedLots.map((l) => l.entreprises?.name).filter(Boolean))]; return c.length ? ` — ${c.join(' / ')}` : ''; })()}`
                                        : 'Choisissez un ou plusieurs lots pour un rapport par lot : leur nom et leur entreprise figurent en page de garde.'}
                                </Text>
                            </View>
                        )}

                        {/* Contenu du rapport d'avancement */}
                        {isProgress && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>CONTENU DU RAPPORT</Text>
                                {PROGRESS_PARTS.map(({ key, label, hint }) => {
                                    const disabled = key === 'ganttTasks' && !progress.gantt;
                                    const val = Boolean(progress[key]) && !disabled;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            disabled={disabled}
                                            onPress={() => setProgress((p) => ({ ...p, [key]: !p[key] }))}
                                            style={[rm.fieldRow, disabled && { opacity: 0.4 }]}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[rm.fieldCheck, val && rm.fieldCheckActive]}>
                                                {val && <Feather name="check" size={11} color="#fff" />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={rm.fieldLabel}>{label}</Text>
                                                <Text style={[rm.modeHint, { marginTop: 1 }]}>{hint}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {isProgress && progress.workforce && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>EFFECTIFS DE SITE (AUJOURD'HUI)</Text>
                                {lotCompanies.map((r) => (
                                    <View key={r.key} style={rm.wfRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={rm.fieldLabel} numberOfLines={1}>{r.name}</Text>
                                            <Text style={[rm.modeHint, { marginTop: 1 }]} numberOfLines={1}>{r.lots}</Text>
                                        </View>
                                        <TextInput
                                            value={counts[r.key] ?? ''}
                                            onChangeText={(t) => setCounts((c) => ({ ...c, [r.key]: t.replace(/[^0-9]/g, '') }))}
                                            placeholder="0"
                                            placeholderTextColor="#D3D3CE"
                                            keyboardType="number-pad"
                                            accessibilityLabel={`Effectif ${r.name}`}
                                            style={rm.wfCount}
                                        />
                                    </View>
                                ))}
                                {extraCompanies.map((r, i) => (
                                    <View key={i} style={rm.wfRow}>
                                        <TextInput
                                            value={r.name}
                                            onChangeText={(t) => setExtraCompanies((rows) => rows.map((x, j) => (j === i ? { ...x, name: t } : x)))}
                                            placeholder="Entreprise"
                                            placeholderTextColor="#D3D3CE"
                                            style={[rm.wfCount, { flex: 1, width: undefined, textAlign: 'left' }]}
                                        />
                                        <TextInput
                                            value={r.count}
                                            onChangeText={(t) => setExtraCompanies((rows) => rows.map((x, j) => (j === i ? { ...x, count: t.replace(/[^0-9]/g, '') } : x)))}
                                            placeholder="0"
                                            placeholderTextColor="#D3D3CE"
                                            keyboardType="number-pad"
                                            accessibilityLabel="Effectif"
                                            style={rm.wfCount}
                                        />
                                        <TouchableOpacity onPress={() => setExtraCompanies((rows) => rows.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Retirer">
                                            <Feather name="x" size={16} color="#8A8A84" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <View style={[rm.wfRow, { borderBottomWidth: 0 }]}>
                                    <TouchableOpacity onPress={() => setExtraCompanies((rows) => [...rows, { name: '', count: '' }])} style={{ flex: 1 }}>
                                        <Text style={[rm.fieldLabel, { color: '#5B5B56' }]}>+ Ajouter une entreprise</Text>
                                    </TouchableOpacity>
                                    <Text style={rm.fieldLabel}>Total : {totalWorkforce} pers.</Text>
                                </View>
                                <Text style={rm.modeHint}>Les entreprises sans effectif ne figurent pas dans le rapport.</Text>
                            </View>
                        )}

                        {/* Display mode (avancement : présentation du détail des tâches, après le contenu) */}
                        {(!isProgress || progress.details) && (
                        <View style={rm.section}>
                            <Text style={rm.sectionLabel}>{isProgress ? 'PRÉSENTATION DU DÉTAIL DES TÂCHES' : "MODE D'AFFICHAGE"}</Text>
                            <View style={[rm.modeRow, { flexWrap: 'wrap' }]}>
                                {kind.modes.map((m) => {
                                    const active = displayMode === m;
                                    return (
                                        <TouchableOpacity
                                            key={m}
                                            style={[rm.modeBtn, kind.modes.length > 2 && { flexBasis: '45%' }, active && rm.modeBtnActive]}
                                            onPress={() => setDisplayMode(m)}
                                        >
                                            <Feather name={DISPLAY_MODES[m].icon} size={15} color={active ? '#fff' : '#5B5B56'} />
                                            <Text style={[rm.modeBtnText, active && rm.modeBtnTextActive]}>
                                                {DISPLAY_MODES[m].label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <Text style={rm.modeHint}>{DISPLAY_MODES[displayMode]?.hint}</Text>
                        </View>
                        )}

                        {/* Fields (unchanged) */}
                        <View style={rm.section}>
                            <Text style={rm.sectionLabel}>CHAMPS À INCLURE</Text>
                            {/* Début et avancement ne concernent que les tâches. */}
                            {Object.entries(fields).filter(([key]) => !['startDate', 'progress'].includes(key) || !['reserves', 'visite'].includes(reportKind)).map(([key, val]) => (
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
                                                        trackColor={{ false: '#E4E4E0', true: '#1C1C1A' }}
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
                                                    <Feather name="arrow-up" size={14} color={i === 0 ? '#D3D3CE' : '#33332F'} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => movePlanningImage(i, 1)}
                                                    disabled={i === planningImages.length - 1}
                                                    style={rm.iconBtn}
                                                >
                                                    <Feather name="arrow-down" size={14} color={i === planningImages.length - 1 ? '#D3D3CE' : '#33332F'} />
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={() => removePlanningImage(i)} style={rm.iconBtn}>
                                                    <Feather name="x" size={16} color="#A8322A" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Upload button */}
                                <TouchableOpacity style={rm.uploadBtn} onPress={pickPlanningImages}>
                                    <Feather name="upload-cloud" size={18} color="#33332F" />
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
                                            placeholderTextColor="#D3D3CE"
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
                                            placeholderTextColor="#D3D3CE"
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

                        {isProgress && progress.conclusion && (
                            <View style={rm.section}>
                                <Text style={rm.sectionLabel}>RECOMMANDATIONS ET CONCLUSION</Text>
                                <TextInput
                                    value={conclusionText}
                                    onChangeText={setConclusionText}
                                    placeholder={'- Renforcer l\'effectif du lot menuiseries\n- ...'}
                                    placeholderTextColor="#D3D3CE"
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                    style={[rm.customSectionInput, { marginTop: 6 }]}
                                />
                                <Text style={rm.customSectionHint}>
                                    Préfixez une ligne avec - ou • pour créer une puce.
                                </Text>
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
        color: '#1C1C1A',
    },
    subtitle: {
        fontSize: 12,
        fontFamily: 'Outfit_400Regular',
        color: '#8A8A84',
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
        color: '#8A8A84',
        letterSpacing: 1,
        marginBottom: 10,
    },
    // Template chips
    templateChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E4E4E0',
        backgroundColor: '#F8F8F6',
        marginRight: 8,
    },
    templateChipActive: {
        backgroundColor: '#1C1C1A',
        borderColor: '#1C1C1A',
    },
    templateChipText: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#5B5B56',
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
        borderColor: '#E4E4E0',
        backgroundColor: '#F8F8F6',
    },
    modeBtnActive: {
        backgroundColor: '#1C1C1A',
        borderColor: '#1C1C1A',
    },
    modeBtnText: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#5B5B56',
    },
    modeBtnTextActive: {
        color: '#fff',
    },
    modeHint: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#8A8A84',
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
        borderColor: '#D3D3CE',
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fieldCheckActive: {
        backgroundColor: '#1C1C1A',
        borderColor: '#1C1C1A',
    },
    fieldLabel: {
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        color: '#33332F',
    },
    // Participants
    emptyText: {
        fontSize: 12,
        fontFamily: 'Outfit_400Regular',
        color: '#D3D3CE',
        marginTop: 4,
    },
    participantsList: {
        borderWidth: 1,
        borderColor: '#E4E4E0',
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
        borderBottomColor: '#F3F3F0',
    },
    participantAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E4E4E0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    participantAvatarText: {
        fontSize: 12,
        fontFamily: 'Outfit_600SemiBold',
        color: '#5B5B56',
    },
    participantName: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#1C1C1A',
    },
    participantRole: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#8A8A84',
    },
    participantEmail: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#D3D3CE',
    },
    presenceLabel: {
        fontSize: 11,
        fontFamily: 'Outfit_500Medium',
        color: '#D3D3CE',
    },
    presenceLabelActive: {
        color: '#2F6B4A',
    },
    // Custom sections
    customSectionTitle: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#33332F',
    },
    customSectionType: {
        fontSize: 11,
        fontFamily: 'Outfit_400Regular',
        color: '#D3D3CE',
    },
    customSectionInput: {
        borderWidth: 1,
        borderColor: '#E4E4E0',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        color: '#1C1C1A',
        backgroundColor: '#F8F8F6',
        minHeight: 80,
    },
    customSectionHint: {
        fontSize: 10,
        fontFamily: 'Outfit_400Regular',
        color: '#D3D3CE',
        marginTop: 4,
    },
    // Footer
    footer: {
        flexDirection: 'row',
        gap: 10,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F3F0',
        marginTop: 4,
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 10,
        backgroundColor: '#F3F3F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: {
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#33332F',
    },
    confirmBtn: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderRadius: 10,
        backgroundColor: '#1C1C1A',
    },
    confirmBtnText: {
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#fff',
    },
    lotChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#E4E4E0',
        backgroundColor: '#F8F8F6',
    },
    wfRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F1EE',
    },
    wfCount: {
        width: 64,
        borderWidth: 1,
        borderColor: '#E4E4E0',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#1C1C1A',
        backgroundColor: '#F8F8F6',
        textAlign: 'right',
    },
    // ── NEW: Title input
    titleInput: {
        borderWidth: 1,
        borderColor: '#E4E4E0',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 14,
        fontFamily: 'Outfit_600SemiBold',
        color: '#1C1C1A',
        backgroundColor: '#F8F8F6',
        marginTop: 4,
    },
    // ── NEW: Planning images
    planningImageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F8F8F6',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E4E4E0',
    },
    planningThumb: {
        width: 56,
        height: 42,
        borderRadius: 4,
        backgroundColor: '#E4E4E0',
    },
    planningImageName: {
        fontSize: 12,
        fontFamily: 'Outfit_500Medium',
        color: '#1C1C1A',
    },
    planningImagePage: {
        fontSize: 10,
        fontFamily: 'Outfit_400Regular',
        color: '#8A8A84',
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
        borderColor: '#D3D3CE',
        borderStyle: 'dashed',
        backgroundColor: '#F8F8F6',
        marginTop: 4,
    },
    uploadText: {
        fontSize: 13,
        fontFamily: 'Outfit_500Medium',
        color: '#33332F',
    },
});
