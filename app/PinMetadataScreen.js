import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
    ExpoSpeechRecognitionModule,
    useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { useAtom } from 'jotai';
import debounce from 'lodash/debounce';
import {
    AccessibilityIcon,
    AirVentIcon,
    AlarmSmokeIcon,
    AsteriskIcon,
    BadgeIcon,
    BanIcon,
    BlocksIcon,
    BoltIcon,
    BoxesIcon,
    BoxIcon,
    BrickWallIcon,
    BrushIcon,
    Calendar,
    Camera,
    CarIcon,
    CctvIcon,
    CheckCircle,
    CheckIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    X as CloseIcon,
    ConstructionIcon,
    Copy,
    DoorClosedIcon,
    DoorOpenIcon,
    DropletOffIcon,
    DropletsIcon,
    EllipsisVertical,
    EyeOff,
    FireExtinguisherIcon,
    FlameIcon,
    FolderIcon,
    FolderOpen,
    GripIcon,
    MapPin,
    Mic as MicIcon,
    PackageIcon,
    PaintRoller,
    Scissors,
    SendIcon,
    SnowflakeIcon,
    Trash2,
    TrendingDownIcon,
    TrendingUpIcon,
    User,
    UserPlus,
    WifiIcon,
    ZapIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Keyboard,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { runOnJS } from 'react-native-reanimated';
import PinTagEditor from '../components/PinTagEditor';
import PlanMiniSnapshot from '../components/PlanMiniSnapshot';
import Timeline from '../components/TimeLine';
import { supabase } from '../lib/supabase';
import { authHeaders } from '../lib/api';
import { categoriesAtom, membersAtom, MetaPinAtom, PhotoPlanPositionAtom, pinsAtom, selectedPinAtom, selectedProjectAtom, statusesAtom } from '../store/atoms';

const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const getCategoryIconComponent = (iconName, color = 'white', size = 20) => {
    switch (iconName) {
        case 'zap':               return <ZapIcon color={color} size={size} />;
        case 'fire-extinguisher': return <FireExtinguisherIcon color={color} size={size} />;
        case 'droplets':          return <DropletsIcon color={color} size={size} />;
        case 'snowflake':         return <SnowflakeIcon color={color} size={size} />;
        case 'doors':             return <DoorClosedIcon color={color} size={size} />;
        case 'paint':             return <PaintRoller color={color} size={size} />;
        case 'unassigned':        return <CheckIcon color={color} size={size} />;
        case 'carrelage':         return <GripIcon color={color} size={size} />;
        case 'folder':            return <FolderIcon color={color} size={size} />;
        case 'air-vent':          return <AirVentIcon color={color} size={size} />;
        case 'alarm-smoke':       return <AlarmSmokeIcon color={color} size={size} />;
        case 'check-circle':      return <CheckCircle color={color} size={size} />;
        case 'package':           return <PackageIcon color={color} size={size} />;
        case 'brick-wall':        return <BrickWallIcon color={color} size={size} />;
        case 'brush-cleaning':    return <BrushIcon color={color} size={size} />;
        case 'construction':      return <ConstructionIcon color={color} size={size} />;
        case 'droplet-off':       return <DropletOffIcon color={color} size={size} />;
        case 'door-open':         return <DoorOpenIcon color={color} size={size} />;
        case 'trending-up':       return <TrendingUpIcon color={color} size={size} />;
        case 'flame':             return <FlameIcon color={color} size={size} />;
        case 'trending-down':     return <TrendingDownIcon color={color} size={size} />;
        case 'wifi':              return <WifiIcon color={color} size={size} />;
        case 'accessibility':     return <AccessibilityIcon color={color} size={size} />;
        case 'asterisk':          return <AsteriskIcon color={color} size={size} />;
        case 'badge':             return <BadgeIcon color={color} size={size} />;
        case 'ban':               return <BanIcon color={color} size={size} />;
        case 'blocks':           return <BlocksIcon color={color} size={size} />;
        case 'bolt':              return <BoltIcon color={color} size={size} />;
        case 'box':               return <BoxIcon color={color} size={size} />;
        case 'boxes':            return <BoxesIcon color={color} size={size} />;
        case 'car':               return <CarIcon color={color} size={size} />;
        case 'cctv':              return <CctvIcon color={color} size={size} />;
        default:                  return <CheckIcon color={color} size={size} />;
    }
};

export default function PinMetadataScreen() {
    const navigation = useNavigation();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { from } = params;
    const { pinId, photoUris } = params;

    const [pins, setPins] = useAtom(pinsAtom);
    const [selectedPin, setSelectedPin] = useAtom(selectedPinAtom);
    const [categories] = useAtom(categoriesAtom);
    const [statuses] = useAtom(statusesAtom);
    const [selectedMembers] = useAtom(membersAtom);
    const [selectedProject] = useAtom(selectedProjectAtom);

    const [showPlanSelector, setShowPlanSelector] = useState(false);
    const [availablePlans, setAvailablePlans] = useState([]);
    const [loadingPlans, setLoadingPlans] = useState(false);
    // ── Cible du sélecteur de plan : 'pin' (comportement historique) ou l'objet
    // photo en cours de placement (voir handleOpenPlanSelectorForPhoto). ──
    const [planSelectorTarget, setPlanSelectorTarget] = useState('pin');

    const [currentPinId, setCurrentPinId] = useState(pinId);
    const [currentRole, setCurrentRole] = useState(null);
    const currentMemberRef = useRef(null);
    const pin = pins?.find((p) => p.id === currentPinId) ?? {};

    const currentPinIndex = pins?.findIndex((p) => p.id === currentPinId) ?? -1;
    const hasPrevious = currentPinIndex > 0;
    const hasNext = currentPinIndex >= 0 && currentPinIndex < (pins?.length ?? 0) - 1;

    const [keyboardHeight, setKeyboardHeight] = useState(0);

    let parsedPhotoUris = [];
    try {
        if (photoUris) {
            if (typeof photoUris === 'string' && photoUris.startsWith('[')) {
                parsedPhotoUris = JSON.parse(photoUris);
            } else if (typeof photoUris === 'string') {
                parsedPhotoUris = [photoUris];
            } else if (Array.isArray(photoUris)) {
                parsedPhotoUris = photoUris;
            }
        }
    } catch (e) {
        console.warn('Failed to parse photoUris:', e);
    }

    const [name, setName] = useState(pin?.name || '');
    const [note, setNote] = useState(pin?.note || '');
    const [planId, setPlanId] = useState(pin?.plan_id || null);
    const [planName, setPlanName] = useState(pin?.plans?.name || '');
    const [planUri, setPlanUri] = useState(pin?.plans?.file_url || '');
    const [plan, setPlan] = useState(pin?.plans || null);
    const [category, setCategory] = useState(
        categories.find((c) => c.id === pin?.category_id) || categories[0]
    );
    const [status, setStatus] = useState(
        statuses.find((s) => s.id === pin?.status_id) || statuses[0]
    );
    const [photos, setPhotos] = useState(parsedPhotoUris || pin?.photoUris || []);
    const [assignee, setAssignee] = useState(pin?.assigned_to || null);
    const [due_date, setDue_date] = useState(pin?.due_date || null);
    const [xcoordinate, setXcoordinate] = useState(pin?.x || null);
    const [ycoordinate, setYcoordinate] = useState(pin?.y || null);

    const [showAllEvents, setShowAllEvents] = useState(false);
    const [events, setEvents] = useState(pin?.events || []);
    const [commentText, setCommentText] = useState('');

    const [project_number, setProjectNumber] = useState('');
    const [pin_number, setPinNumber] = useState('');
    const [planPngPublicUrl, setPlanPngPublicUrl] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showAssigneeSheet, setShowAssigneeSheet] = useState(false);
    const [showStatusSheet, setShowStatusSheet] = useState(false);
    const [showCategorySheet, setShowCategorySheet] = useState(false);
    const [showActionsSheet, setShowActionsSheet] = useState(false);
    const [comments, setComments] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [dictationTarget, setDictationTarget] = useState(null);
    const [partialResult, setPartialResult] = useState('');
    const [metapin, setMetapin] = useAtom(MetaPinAtom);
    const [photoPlanUpdate, setPhotoPlanUpdate] = useAtom(PhotoPlanPositionAtom);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const recognizedTextRef = useRef('');

    // ─── Refs to track latest name/note values for beforeRemove flush ─────────
    const nameRef = useRef(name);
    const noteRef = useRef(note);

    const SWIPE_VELOCITY_THRESHOLD = 500;
    const SWIPE_DISTANCE_THRESHOLD = 50;
    const skipNextReloadRef = useRef(false);

    // ─── Centralized patch enrichment ────────────────────────────────────────
    const buildPatch = (patch) => ({
        ...patch,
        updated_at: new Date().toISOString(),
        updated_by: currentMemberRef.current?.id,
    });

    useEffect(() => {
        const show = Keyboard.addListener('keyboardDidShow', (e) => {
            setKeyboardHeight(e.endCoordinates.height);
        });
        const hide = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardHeight(0);
        });
        return () => { show.remove(); hide.remove(); };
    }, []);

    useEffect(() => {
        const loadRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    console.log('👤 user.id:', user?.id);
    console.log('👥 selectedMembers:', JSON.stringify(selectedMembers?.map(m => ({ id: m.id, auth_id: m.auth_id, name: m.name }))));
    const member = selectedMembers?.find(m => m.auth_id === user?.id);
    console.log('🎯 member found:', JSON.stringify(member));
    setCurrentRole(member?.role);
    currentMemberRef.current = member;
    console.log('✅ currentMemberRef.current set to:', currentMemberRef.current?.id);
};
        loadRole();
    }, [selectedMembers]);

    useEffect(() => {
        if (metapin.id === pinId) {
            setXcoordinate(metapin.x);
            setYcoordinate(metapin.y);
        }
    }, [metapin]);

    const isReadOnly = currentRole === 'guest' || currentRole === 'observateur';
    const canEditEverythingElse = !isReadOnly;

    const isAllowedPatch = (patch) => {
        if (!isReadOnly) return true;
        return Object.keys(patch).every(key => key === 'status_id');
    };

    const router = useRouter();

    const handleClose = () => {
        if (params.from === 'Pdf') {
            router.dismissAll();
            router.replace({
                pathname: '/plans/MainScreen',
                params: {
                    myuri: params.myuri,
                    myname: params.myname,
                    myplanid: params.myplanid,
                    refresh: Date.now(),
                },
            });
        } else {
            router.back();
        }
    };

    async function getPinFromId(id) {
        if (!id) return;
        const { data, error } = await supabase
            .from('pdf_pins')
            .select('*,projects(*),events(*,pins_photos(*),members(*)),assigned_to(*),categories(*),Status(*),plans(*),pin_tags(tag_id, tags(*))')
            .eq('id', id)
            .single();
        if (data) {
            if (skipNextReloadRef.current) {
                skipNextReloadRef.current = false;
                return;
            }
            setName(data.name);
            nameRef.current = data.name;
            setNote(data.note);
            noteRef.current = data.note;
            lastSavedTextRef.current = { name: data.name ?? '', note: data.note ?? '' };
            setProjectNumber(data.projects?.project_number || '');
            setPinNumber(data.pin_number || '');
            setSelectedPin(data);
            setCategory(categories.find((c) => c.id === data.category_id) || categories[0]);
            setStatus(statuses.find((s) => s.id === data.status_id) || statuses[0]);
            setPhotos(data.photoUris || parsedPhotoUris || []);
            setAssignee(data.assigned_to || null);
            setDue_date(data.due_date || null);
            setEvents(data.events || []);
            setPlanId(data.plan_id || null);
            setPlanName(data.plans?.name || '');
            setPlanUri(data.plans?.file_url || '');
            setPlan(data.plans || null);
            setXcoordinate(data.x || null);
            setYcoordinate(data.y || null);
            const flatTags = (data.pin_tags ?? []).map((pt) => pt.tags).filter(Boolean);
            const pinWithTags = { ...data, tags: flatTags };
            setSelectedPin(pinWithTags);
            setPins((prev) => {
                const updated = prev.map((p) => p.id === data.id ? pinWithTags : p);
                return updated;
            });

            if (data.plans?.png_url) {
                const { data: urlData } = supabase
                    .storage
                    .from('project-plans')
                    .getPublicUrl(data.plans.png_url);
                setPlanPngPublicUrl(urlData.publicUrl);
            }
            const { data: commentsData } = await supabase
                .from('comments')
                .select('*, members(*)')
                .eq('pin_id', id)
                .order('created_at', { ascending: false });

            if (commentsData) setComments(commentsData);
        }
    }

    useEffect(() => {
        if (currentPinId) {
            getPinFromId(currentPinId);
        } else {
            setName('');
            nameRef.current = '';
            setNote('');
            noteRef.current = '';
            setCategory(categories[0]);
            setStatus(statuses[0]);
            setXcoordinate(null);
            setYcoordinate(null);
        }
    }, [currentPinId]);

    // ─── Enregistrement d'un pin ──────────────────────────────────────────────
    // Seuls les champs modifiés sont envoyés, la réponse est attendue, et un
    // échec est signalé à l'utilisateur au lieu d'être ignoré.
    const SAVABLE_FIELDS = ['name', 'note', 'status_id', 'category_id', 'assigned_to_id', 'due_date'];
    const lastSavedTextRef = useRef({ name: null, note: null });

    const persistPatch = async (targetPinId, patch) => {
        const dbPatch = {};
        for (const key of SAVABLE_FIELDS) {
            if (!(key in patch)) continue;
            // La colonne s'appelle assigned_to ; l'écran manipule assigned_to_id.
            dbPatch[key === 'assigned_to_id' ? 'assigned_to' : key] = patch[key] ?? null;
        }
        if (Object.keys(dbPatch).length === 0) return;
        dbPatch.updated_at = patch.updated_at;
        if (patch.updated_by) dbPatch.updated_by = patch.updated_by;

        const { data, error } = await supabase
            .from('pdf_pins')
            .update(dbPatch)
            .eq('id', targetPinId)
            .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Aucune ligne mise à jour');
    };

    const immediateSave = async (fieldPatch, { silent = false } = {}) => {
        const enrichedPatch = buildPatch(fieldPatch);
        // Le contrôle porte sur les champs demandés : updated_at / updated_by sont
        // ajoutés automatiquement et bloquaient à tort le changement de statut des invités.
        if (!isAllowedPatch(fieldPatch)) {
            if (!silent) Alert.alert('Accès limité', 'Vous ne pouvez pas modifier ce champ.');
            return false;
        }
        const targetPinId = currentPinId;
        try {
            if (!targetPinId) {
                const newTask = {
                    name,
                    note,
                    project_id: selectedProject?.id,
                    status_id: status?.id,
                    category_id: category?.id,
                    due_date,
                    assigned_to: assignee?.id ?? null,
                    x: null,
                    y: null,
                    ...enrichedPatch,
                };
                if ('assigned_to_id' in newTask) {
                    newTask.assigned_to = newTask.assigned_to_id ?? null;
                    delete newTask.assigned_to_id;
                }
                const { data, error } = await supabase
                    .from('pdf_pins')
                    .insert([newTask])
                    .select()
                    .single();
                if (error) throw error;
                setCurrentPinId(data.id);
                setPins(prev => [...prev, data]);
                return true;
            }

            await persistPatch(targetPinId, enrichedPatch);

            if ('name' in fieldPatch) lastSavedTextRef.current.name = fieldPatch.name ?? '';
            if ('note' in fieldPatch) lastSavedTextRef.current.note = fieldPatch.note ?? '';
            setPins((prevPins) => prevPins.map(p => p.id === targetPinId ? { ...p, ...enrichedPatch } : p));
            return true;
        } catch (err) {
            console.error('Pin save failed:', err?.message ?? err);
            Alert.alert(
                'Modification non enregistrée',
                'Vérifiez votre connexion. La modification n\'a pas été envoyée.',
                [
                    {
                        text: 'Annuler',
                        style: 'cancel',
                        // Réaffiche l'état réellement enregistré.
                        onPress: () => { if (targetPinId && targetPinId === currentPinIdRef.current) getPinFromId(targetPinId); },
                    },
                    { text: 'Réessayer', onPress: () => { saveFieldsRef.current?.(fieldPatch, { silent }); } },
                ]
            );
            return false;
        }
    };

    // Toujours la dernière version de immediateSave : le debounce et l'écouteur
    // de fermeture sont créés une seule fois et ne doivent pas garder le pin, le
    // rôle ou l'identifiant du premier rendu.
    const saveFieldsRef = useRef(immediateSave);
    saveFieldsRef.current = immediateSave;
    const currentPinIdRef = useRef(currentPinId);
    currentPinIdRef.current = currentPinId;

    // N'envoie le nom / la note que s'ils ont réellement changé.
    const changedText = () => {
        const patch = {};
        if ((nameRef.current ?? '') !== (lastSavedTextRef.current.name ?? '')) patch.name = nameRef.current ?? '';
        if ((noteRef.current ?? '') !== (lastSavedTextRef.current.note ?? '')) patch.note = noteRef.current ?? '';
        return patch;
    };
    const changedTextRef = useRef(changedText);
    changedTextRef.current = changedText;

    const debouncedSaveRef = useRef(
        debounce(() => {
            const patch = changedTextRef.current();
            if (Object.keys(patch).length > 0) saveFieldsRef.current?.(patch, { silent: true });
        }, 600)
    ).current;

    // ─── Flush name+note on screen close (beforeRemove) ──────────────────────
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', () => {
            debouncedSaveRef.cancel();
            if (!currentPinId) return;
            const patch = changedTextRef.current();
            if (Object.keys(patch).length > 0) saveFieldsRef.current?.(patch, { silent: true });
        });
        return unsubscribe;
    }, [currentPinId]);

    const assignPin = async ({ pinId, assignedByName, assigneeId, assignedUserEmail, assignedUserName }) => {
        const response = await fetch('https://zaynspace.com/api/send-task-notification', {
            method: 'POST',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                deepLink: `https://zaynspace.com/task/${pinId}`,
                taskId: pinId,
                projectId: selectedPin.project_id,
                assignedBy: assignedByName,
                assignedUserEmail,
                assignedUserName,
                dueDate: selectedPin.due_date,
                taskName: selectedPin?.name || 'Sans nom',
            })
        });
        const result = await response.json();
        if (response.ok) console.log('✅ Email sent successfully:', result);
        else console.error('❌ Error sending email:', result);

        const res = await fetch('https://zaynbackend-production.up.railway.app/api/pins/assign', {
            method: 'POST',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                pinId,
                type: 'pin_assigned',
                taskName: pin?.name || 'Sans nom',
                assignedToUserId: assigneeId,
                assignedBy: assignedByName,
                deepLink: `https://zaynspace.com/pin/${pinId}`,
            }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Failed to assign pin');
        }
        return res.json();
    };

    const fetchProjectPlans = async () => {
        setLoadingPlans(true);
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .eq('project_id', selectedProject?.id || pin?.project_id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setAvailablePlans(data || []);
        } catch (err) {
            console.error('Error fetching plans:', err);
            Alert.alert('Erreur', 'Impossible de charger les plans');
        } finally {
            setLoadingPlans(false);
        }
    };

    // ─── Sélection d'un plan dans la sheet — branche selon la cible ──────────
    // 'pin' (comportement historique, écran /PinPlacementScreen) ou une PHOTO
    // individuelle (mode 'photo' de /ImagePinPlacementScreen, voir
    // handleOpenPlanSelectorForPhoto ci-dessous).
    const handlePlanSelected = (selectedPlan) => {
        setShowPlanSelector(false);
        const pdfInfo = {
            width: selectedPlan.width,
            height: selectedPlan.height,
            tilesPath: selectedPlan.tiles_path,
        };

        if (planSelectorTarget && planSelectorTarget !== 'pin') {
            const photo = planSelectorTarget;
            const existingOnThisPlan = photo.plan_id === selectedPlan.id;
            router.push({
                pathname: '/ImagePinPlacementScreen',
                params: {
                    myname: selectedPlan.name,
                    myplanid: selectedPlan.id,
                    mode: 'photo',
                    photoKey: String(photo.id),
                    pinIdToPlace: pin.id,
                    x: existingOnThisPlan ? photo.plan_x : undefined,
                    y: existingOnThisPlan ? photo.plan_y : undefined,
                    pdfInfo: JSON.stringify(pdfInfo),
                },
            });
            setPlanSelectorTarget('pin');
            return;
        }

        router.push({
            pathname: '/PinPlacementScreen',
            params: {
                myplanid: selectedPlan.id,
                pinIdToPlace: pin.id,
                x: pin.x,
                y: pin.y,
                userRole: currentRole,
                pdfInfo: JSON.stringify(pdfInfo)
            }
        });
    };

    // ─── Ouvre le sélecteur de plan pour placer/déplacer UNE PHOTO ───────────
    // À passer à <Timeline onPlaceOnPlan={handleOpenPlanSelectorForPhoto} />.
    // Timeline doit appeler onPlaceOnPlan(photo) où photo est l'objet
    // pins_photos complet (au minimum : id, plan_id, plan_x, plan_y).
    const handleOpenPlanSelectorForPhoto = useCallback((photo) => {
        if (!canEditEverythingElse) return;
        if (!photo?.id) {
            Alert.alert('Erreur', 'Photo introuvable');
            return;
        }
        setPlanSelectorTarget(photo);
        fetchProjectPlans();
        setShowPlanSelector(true);
    }, [canEditEverythingElse, selectedProject?.id, pin?.project_id]);

    // ─── Récupère la position choisie dans ImagePinPlacementScreen (mode
    // 'photo') et la persiste sur pins_photos, puis rafraîchit le pin ──────────
    useEffect(() => {
        if (!photoPlanUpdate || photoPlanUpdate.photoKey == null) return;
        const photoId = photoPlanUpdate.photoKey;

        (async () => {
            try {
                const updateData = (photoPlanUpdate.x != null && photoPlanUpdate.y != null)
                    ? { plan_id: photoPlanUpdate.planId, plan_x: photoPlanUpdate.x, plan_y: photoPlanUpdate.y }
                    : { plan_id: null, plan_x: null, plan_y: null };

                const { error } = await supabase
                    .from('pins_photos')
                    .update(updateData)
                    .eq('id', photoId);

                if (error) throw error;

                // Les photos sont imbriquées sous events(*,pins_photos(*)) — on
                // recharge simplement le pin pour récupérer un état cohérent
                // plutôt que de tenter une mise à jour manuelle imbriquée.
                if (currentPinId) getPinFromId(currentPinId);
            } catch (err) {
                console.error('Erreur sauvegarde position photo sur le plan:', err);
                Alert.alert('Erreur', "Impossible d'enregistrer la position de la photo sur le plan");
            } finally {
                setPhotoPlanUpdate(null);
            }
        })();
    }, [photoPlanUpdate]);

    // ─── Name / Note handlers — keep refs in sync ─────────────────────────────
    const handleNameChange = (text) => {
        setName(text);
        nameRef.current = text;
    };

    const handleNoteChange = (text) => {
        setNote(text);
        noteRef.current = text;
    };

    const handleNameBlur = () => { debouncedSaveRef(); };
    const handleNoteBlur = () => { debouncedSaveRef(); };
    const handleOpenStatusSheet = () => { setShowStatusSheet(true); };
    const handleSelectStatus = (newStatus) => {
        setStatus(newStatus);
        setShowStatusSheet(false);
        immediateSave({ status_id: newStatus.id });
    };
    const handleOpenCategorySheet = () => { setShowCategorySheet(true); };
    const handleSelectCategory = (newCat) => {
        setCategory(newCat);
        setShowCategorySheet(false);
        immediateSave({ category_id: newCat.id });
    };

    const handleSendComment = async () => {
        if (!commentText.trim()) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const currentMember = selectedMembers?.find(m => m.auth_id === user?.id);
            if (!currentMember) { Alert.alert('Erreur', 'Utilisateur non trouvé'); return; }
            const newComment = {
                pin_id: pin.id,
                sender_id: currentMember.id,
                username: currentMember.name,
                comment: commentText.trim(),
                created_at: new Date().toISOString(),
            };
            const { data, error } = await supabase
                .from('comments')
                .insert([newComment])
                .select('*, members(*)')
                .single();
            if (error) throw error;
            setComments(prev => [data, ...prev]);
            setCommentText('');
        } catch (err) {
            console.error('Erreur ajout commentaire:', err);
            Alert.alert('Erreur', 'Impossible d\'ajouter le commentaire');
        }
    };

    const handleOpenAssigneeSheet = () => {
        if (!selectedMembers || selectedMembers.length === 0) {
            Alert.alert("Intervenants", "Aucun membre trouvé pour ce projet.");
            return;
        }
        setShowAssigneeSheet(true);
    };

    const handleSelectAssignee = async (member) => {
        setAssignee(member);
        setShowAssigneeSheet(false);
        const saved = await immediateSave({ assigned_to_id: member?.id ?? null });
        if (!saved || !member?.id) return;
        try {
            await assignPin({
                pinId: pin.id,
                assignedByName: currentMemberRef.current?.name,
                assigneeId: member?.id,
                assignedUserEmail: member?.email,
                assignedUserName: member?.name,
            });
        } catch (err) {
            console.error('Assignment notification failed:', err);
        }
    };

    const handleClearAssignee = () => {
        setAssignee(null);
        immediateSave({ assigned_to_id: null });
    };

    const handleOpenDatePicker = () => { setShowDatePicker(true); };
    const onChangeDate = (event, selectedDate) => {
        setShowDatePicker(false);
        if (event.type === 'set' && selectedDate) {
            const dateString = selectedDate.toISOString();
            setDue_date(dateString);
            immediateSave({ due_date: dateString });
        }
    };
    const handleClearDueDate = () => {
        setDue_date(null);
        immediateSave({ due_date: null });
    };

    // Avant de changer de pin : enregistrer le texte en cours sur le pin affiché,
    // pour qu'il ne soit ni perdu ni écrit sur le pin suivant.
    const flushTextEdits = () => {
        debouncedSaveRef.cancel();
        const patch = changedText();
        if (Object.keys(patch).length > 0) immediateSave(patch, { silent: true });
        lastSavedTextRef.current = { name: nameRef.current ?? '', note: noteRef.current ?? '' };
    };
    const handleNavigateToPrevious = () => {
        if (hasPrevious && pins) { flushTextEdits(); setCurrentPinId(pins[currentPinIndex - 1].id); }
    };
    const handleNavigateToNext = () => {
        if (hasNext && pins) { flushTextEdits(); setCurrentPinId(pins[currentPinIndex + 1].id); }
    };

    const swipeGesture = Gesture.Pan()
        .minDistance(SWIPE_DISTANCE_THRESHOLD)
        .onEnd((e) => {
            const isHorizontalSwipe = Math.abs(e.translationX) > Math.abs(e.translationY);
            if (isHorizontalSwipe) {
                if (e.velocityX > SWIPE_VELOCITY_THRESHOLD && e.translationX > SWIPE_DISTANCE_THRESHOLD) {
                    runOnJS(handleNavigateToPrevious)();
                } else if (e.velocityX < -SWIPE_VELOCITY_THRESHOLD && e.translationX < -SWIPE_DISTANCE_THRESHOLD) {
                    runOnJS(handleNavigateToNext)();
                }
            }
        });

    const handleDuplicatePin = async () => {
        setShowActionsSheet(false);
        try {
            const duplicatedPin = {
                id: uuid.v4(),
                name: `${pin.name || ''} (Copie)`,
                note: pin.note,
                pdf_name: pin.pdf_name,
                x: pin.x != null ? pin.x + 0.01 : null,
                y: pin.y != null ? pin.y + 0.005 : null,
                plan_id: pin.plan_id,
                project_id: pin.project_id,
                status_id: pin.status_id,
                category_id: pin.category_id,
                assigned_to: pin.assigned_to?.id ?? pin.assigned_to ?? null,
                due_date: pin.due_date,
                tags: pin.tags,
                isArchived: pin.isArchived ?? false,
                pin_number: pin.pin_number,
                created_by: pin.created_by,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                updated_by: currentMemberRef.current?.id,
                deleted_at: null,
            };
            const { data, error } = await supabase
                .from('pdf_pins')
                .insert([duplicatedPin])
                .select()
                .single();
            if (error) throw error;
            setPins((prev) => [...(prev || []), data]);
            Alert.alert('Succès', 'Pin dupliqué avec succès');
            setCurrentPinId(data.id);
        } catch (err) {
            console.error('Erreur duplication:', err);
            Alert.alert('Erreur', 'Échec de la duplication du pin');
        }
    };

    const handleDeletePin = async () => {
        setShowActionsSheet(false);
        Alert.alert(
            'Supprimer le pin',
            'Êtes-vous sûr de vouloir supprimer ce pin ?',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Supprimer',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from('pdf_pins')
                                .update({
                                    deleted_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString(),
                                    updated_by: currentMemberRef.current?.id,
                                })
                                .eq('id', pin.id);
                            if (error) throw error;
                            setPins((prev) => prev?.filter((p) => p.id !== pin.id) || []);
                            Alert.alert('Succès', 'Pin supprimé avec succès');
                            handleClose();
                        } catch (err) {
                            console.error('Erreur suppression:', err);
                            Alert.alert('Erreur', 'Échec de la suppression du pin');
                        }
                    },
                },
            ]
        );
    };

    const handleAddPhotosToCurrentPin = () => {
        if (!pin || !pin.id) { Alert.alert('Erreur', 'Pin non chargé'); return; }
        setSelectedPin(pin);
        router.push({
            pathname: "CameraScreen",
            params: {
                myuri: params.myuri,
                myname: params.myname,
                myplanid: params.myplanid || pin.plan_id,
                returnToPinId: pin.id,
            },
        });
    };

    const handleAddSnippetToCurrentPin = async () => {
        if (!pin || !pin.id) { Alert.alert('Erreur', 'Pin non chargé'); return; }
        setSelectedPin(pin);
        if (!planId) { Alert.alert('Erreur', 'Ce pin n\'est pas associé à un plan'); return; }
        try {
            const { data: planData, error } = await supabase
                .from('plans')
                .select('width, height, tiles_path, png_url, name, file_url')
                .eq('id', planId)
                .single();
            if (error) throw error;
            if (!planData) { Alert.alert('Erreur', 'Plan introuvable'); return; }
            if (!planData.width || !planData.height || !planData.tiles_path) {
                Alert.alert('Erreur', 'Informations du plan incomplètes');
                return;
            }
            const pdfInfo = { width: planData.width, height: planData.height, tilesPath: planData.tiles_path };
            setSelectedPin(pin);
            router.push({
                pathname: '/ImageSnippetScreen',
                params: {
                    pinId: pin.id,
                    myuri: planData.file_url,
                    myname: planData.name,
                    myplanid: planId,
                    returnToPinId: pin.id,
                    pdfInfo: JSON.stringify(pdfInfo)
                },
            });
        } catch (err) {
            console.error('Error loading plan for snippet:', err);
            Alert.alert('Erreur', 'Impossible de charger le plan');
        }
    };

    const isDatePast = () => {
        if (!due_date) return false;
        const dueDate = new Date(due_date);
        const today = new Date();
        dueDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return dueDate.getTime() < today.getTime();
    };

    const currentStatus = statuses.find((s) => s.id === status?.id) || statuses[0];
    const currentStatusColor = currentStatus.color || '#ccc';
    const currentCategory = categories.find((c) => c.id === category?.id) || categories[0];
    const initialDate = due_date ? new Date(due_date) : new Date();
    const isPast = isDatePast();

    const dateButtonStyles = [
        styles.actionButton,
        due_date && styles.dateSelectedButton,
        isPast && styles.pastDueBackground,
        isPast && styles.pastDueBorder,
    ];
    const dateTextStyles = [
        styles.actionButtonText,
        due_date && styles.dateSelectedText,
        isPast && styles.pastDueText,
    ];
    const assigneeButtonStyles = [styles.actionButton, assignee && styles.dateSelectedButton];
    const assigneeTextStyles = [styles.actionButtonText, assignee && styles.dateSelectedText];
    const assigneeName = assignee?.name || 'Ajouter intervenant';

    // ─── Speech recognition — shared for name, note, comment ─────────────────
    const applyFinalText = useCallback(() => {
        if (!dictationTarget || !recognizedTextRef.current.trim()) return;
        skipNextReloadRef.current = true;
        const text = recognizedTextRef.current.trim();
        if (dictationTarget === 'name') {
            setName(text);
            nameRef.current = text;
            immediateSave({ name: text });
        } else if (dictationTarget === 'note') {
            setNote(text);
            noteRef.current = text;
            immediateSave({ note: text });
        } else if (dictationTarget === 'comment') {
            // Append to existing comment text so multiple takes accumulate
            setCommentText(prev => prev ? `${prev} ${text}` : text);
        }
        recognizedTextRef.current = '';
        setPartialResult('');
        setDictationTarget(null);
    }, [dictationTarget]);

    useSpeechRecognitionEvent("start", () => { setIsListening(true); });
    useSpeechRecognitionEvent("end", () => {
        setIsListening(false);
        if (recognizedTextRef.current) applyFinalText();
    });
    useSpeechRecognitionEvent("result", (event) => {
        let transcript = event.results[0]?.transcript || '';
        let isFinal = event.isFinal;
        if (!transcript) return;
        if (isFinal) {
            recognizedTextRef.current += (recognizedTextRef.current ? ' ' : '') + transcript;
            if (!ExpoSpeechRecognitionModule.isContinuous) applyFinalText();
        } else {
            setPartialResult(transcript);
        }
    });
    useSpeechRecognitionEvent("error", (event) => {
        Alert.alert('Dictée', `Erreur de reconnaissance: ${event.message}`);
        setIsListening(false);
        setDictationTarget(null);
        setPartialResult('');
        recognizedTextRef.current = '';
    });

    const startListening = async (target) => {
        if (isSpeaking) { setIsSpeaking(false); }
        if (isListening) {
            await ExpoSpeechRecognitionModule.stop().catch(() => {});
            setIsListening(false);
            recognizedTextRef.current = '';
            setPartialResult('');
            setDictationTarget(null);
        }
        setDictationTarget(target);
        recognizedTextRef.current = '';
        setPartialResult('');
        let granted = false;
        try {
            const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
            granted = perm?.granted;
            if (!granted) {
                const req = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
                granted = req?.granted;
            }
        } catch (e) {
            if (Platform.OS === 'android') granted = true;
        }
        if (!granted) { Alert.alert('Permission refusée', 'Activez le microphone dans les réglages'); return; }
        try {
            await ExpoSpeechRecognitionModule.start({ lang: 'fr-FR', continuous: false, interimResults: true });
        } catch (e) {}
    };

    const handleDictateName = () => startListening('name');
    const handleDictateNote = () => startListening('note');
    const handleDictateComment = () => startListening('comment');

    const AssigneeSheet = () => (
        <Modal animationType="slide" transparent visible={showAssigneeSheet} onRequestClose={() => setShowAssigneeSheet(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Choisir un intervenant</Text>
                        <TouchableOpacity onPress={() => setShowAssigneeSheet(false)}><CloseIcon size={24} color="#333" /></TouchableOpacity>
                    </View>
                    <FlatList
                        data={selectedMembers || []}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.memberItem} onPress={() => handleSelectAssignee(item)}>
                                <User size={18} color="#2563eb" />
                                <Text style={styles.memberText}>{item.name}</Text>
                                {assignee?.id === item.id && <CheckIcon size={18} color="#2563eb" style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        )}
                        ListHeaderComponent={() => (
                            <TouchableOpacity style={styles.memberItem} onPress={() => handleSelectAssignee({ id: null, name: null })}>
                                <CloseIcon size={18} color="#999" />
                                <Text style={[styles.memberText, { color: '#999' }]}>Désassigner (Aucun)</Text>
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View style={styles.separator} />}
                    />
                </View>
            </View>
        </Modal>
    );

    const StatusSheet = () => {
        const getFilteredStatuses = () => {
            if (currentRole === 'guest') {
                return statuses.filter(s =>
                    s.id === status?.id ||
                    s.name.toLowerCase() === 'a valider' ||
                    s.name.toLowerCase() === 'à valider'
                );
            }
            return statuses || [];
        };
        const filteredStatuses = getFilteredStatuses();
        return (
            <Modal animationType="slide" transparent visible={showStatusSheet} onRequestClose={() => setShowStatusSheet(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Choisir un statut</Text>
                            <TouchableOpacity onPress={() => setShowStatusSheet(false)}><CloseIcon size={24} color="#333" /></TouchableOpacity>
                        </View>
                        {filteredStatuses.length === 0 ? (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Text style={{ color: '#6B7280', textAlign: 'center' }}>Aucun statut disponible</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={filteredStatuses}
                                keyExtractor={(item) => item.id.toString()}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={styles.memberItem} onPress={() => handleSelectStatus(item)}>
                                        <View style={[styles.statusIndicator, { backgroundColor: item.color || '#ccc' }]} />
                                        <Text style={styles.memberText}>{item.name}</Text>
                                        {status?.id === item.id && <CheckIcon size={18} color="#2563eb" style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>
                                )}
                                ItemSeparatorComponent={() => <View style={styles.separator} />}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        );
    };

    const CategorySheet = () => (
        <Modal animationType="slide" transparent visible={showCategorySheet} onRequestClose={() => setShowCategorySheet(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Choisir une catégorie</Text>
                        <TouchableOpacity onPress={() => setShowCategorySheet(false)}><CloseIcon size={24} color="#333" /></TouchableOpacity>
                    </View>
                    <FlatList
                        data={categories || []}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.memberItem} onPress={() => handleSelectCategory(item)}>
                                <View style={[styles.categoryIconCircleSheet, { backgroundColor: currentStatusColor }]}>
                                    {getCategoryIconComponent(item.icon, '#fff', 18)}
                                </View>
                                <Text style={styles.memberText}>{item.name}</Text>
                                {category?.id === item.id && <CheckIcon size={18} color="#2563eb" style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        )}
                        ItemSeparatorComponent={() => <View style={styles.separator} />}
                    />
                </View>
            </View>
        </Modal>
    );

    const ActionsSheet = () => (
        <Modal animationType="slide" transparent visible={showActionsSheet} onRequestClose={() => setShowActionsSheet(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Actions</Text>
                        <TouchableOpacity onPress={() => setShowActionsSheet(false)}><CloseIcon size={24} color="#333" /></TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.actionItem} onPress={handleDuplicatePin}>
                        <Copy size={20} color="#2563eb" />
                        <Text style={styles.actionText}>Dupliquer le pin</Text>
                    </TouchableOpacity>
                    <View style={styles.separator} />
                    <TouchableOpacity style={styles.actionItem} onPress={handleDeletePin}>
                        <Trash2 size={20} color="#ef4444" />
                        <Text style={[styles.actionText, { color: '#ef4444' }]}>Supprimer le pin</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );

    const PlanSelectorSheet = () => (
        <Modal animationType="slide" transparent visible={showPlanSelector} onRequestClose={() => setShowPlanSelector(false)}>
            <View style={styles.modalOverlay}>
                <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
                    <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Choisir un plan</Text>
                        <TouchableOpacity onPress={() => setShowPlanSelector(false)}><CloseIcon size={24} color="#333" /></TouchableOpacity>
                    </View>
                    {loadingPlans ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#2563eb" />
                            <Text style={{ marginTop: 12, color: '#6B7280' }}>Chargement des plans...</Text>
                        </View>
                    ) : availablePlans.length === 0 ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: '#6B7280', textAlign: 'center' }}>Aucun plan disponible pour ce projet</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={availablePlans}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.planItem} onPress={() => handlePlanSelected(item)}>
                                    <View style={styles.planIconCircle}>
                                        <FolderOpen size={20} color="#2563eb" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.planItemTitle}>{item.name}</Text>
                                        {item.description && (
                                            <Text style={styles.planItemSubtitle} numberOfLines={1}>{item.description}</Text>
                                        )}
                                    </View>
                                    <ChevronRight size={20} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                            ItemSeparatorComponent={() => <View style={styles.separator} />}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );

    const COMMENT_BAR_HEIGHT = 64;

    // ── Hauteur d'espace réservée sous la barre de commentaire (safe area ou clavier) ──
    const commentBarBottomInset = keyboardHeight > 0 ? keyboardHeight : insets.bottom;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'left', 'right']}>
            <View style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => handleClose()} style={styles.iconCircle}>
                        <CloseIcon size={20} color="#111" />
                    </TouchableOpacity>
                    <View style={styles.middleIcons}>
                        <TouchableOpacity onPress={handleNavigateToPrevious} style={[styles.iconCircle, !hasPrevious && styles.disabledButton]} disabled={!hasPrevious}>
                            <ChevronLeft size={20} color={hasPrevious ? "#111" : "#ccc"} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleNavigateToNext} style={[styles.iconCircle, !hasNext && styles.disabledButton]} disabled={!hasNext}>
                            <ChevronRight size={20} color={hasNext ? "#111" : "#ccc"} />
                        </TouchableOpacity>
                    </View>
                    {isReadOnly && (
                        <View style={styles.readOnlyBadge}>
                            <EyeOff size={14} color="#dc2626" />
                            <Text style={styles.readOnlyBadgeText}>Lecture seule</Text>
                        </View>
                    )}
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity onPress={() => setShowActionsSheet(true)} style={styles.iconCircle}>
                        <EllipsisVertical size={20} color="#111" />
                    </TouchableOpacity>
                </View>

                <GestureDetector gesture={swipeGesture}>
                    <ScrollView
                        contentContainerStyle={[styles.scroll, { paddingBottom: COMMENT_BAR_HEIGHT + insets.bottom + 20 }]}
                        keyboardShouldPersistTaps="handled"
                        style={{ flex: 1 }}
                    >
                        <View style={styles.statusRow}>
                            <View style={[styles.statusIconCircle, { backgroundColor: currentStatusColor }]}>
                                {getCategoryIconComponent(currentCategory.icon, 'white', 20)}
                            </View>
                            <TouchableOpacity style={[styles.statusButton, { backgroundColor: currentStatusColor }]} onPress={handleOpenStatusSheet}>
                                <Text style={styles.statusButtonText}>{currentStatus.name}</Text>
                                <ChevronDown size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.idText}>ID : {project_number} - {pin_number}</Text>

                        <View style={styles.inputContainerDictation}>
                            <TextInput
                                editable={canEditEverythingElse}
                                selectTextOnFocus={canEditEverythingElse}
                                pointerEvents={canEditEverythingElse ? 'auto' : 'none'}
                                style={[styles.textAreaDictation, !canEditEverythingElse && styles.readOnlyInput]}
                                value={isListening && dictationTarget === 'name' ? (partialResult || name) : name}
                                onChangeText={handleNameChange}
                                onBlur={handleNameBlur}
                                placeholder="Ajouter un nom ici..."
                                placeholderTextColor="#999"
                                multiline
                            />
                            {canEditEverythingElse && (
                                <TouchableOpacity
                                    style={[styles.micButton, isListening && dictationTarget === 'name' && styles.micButtonActive]}
                                    onPress={handleDictateName}
                                    disabled={isListening && dictationTarget !== 'name'}
                                >
                                    <MicIcon size={20} color={isListening && dictationTarget === 'name' ? "#fff" : "#6B7280"} />
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={[styles.inputContainerDictation, !canEditEverythingElse && styles.readOnlyInput]}>
                            <TextInput
                                editable={canEditEverythingElse}
                                selectTextOnFocus={canEditEverythingElse}
                                pointerEvents={canEditEverythingElse ? 'auto' : 'none'}
                                style={styles.noteInputDictation}
                                value={isListening && dictationTarget === 'note' ? (partialResult || note) : note}
                                onChangeText={handleNoteChange}
                                onBlur={handleNoteBlur}
                                placeholder="Ajouter une description ici..."
                                placeholderTextColor="#999"
                                multiline
                            />
                            {canEditEverythingElse && (
                                <TouchableOpacity
                                    style={[styles.micButtonNote, isListening && dictationTarget === 'note' && styles.micButtonActive]}
                                    onPress={handleDictateNote}
                                    disabled={isListening && dictationTarget !== 'note'}
                                >
                                    <MicIcon size={20} color={isListening && dictationTarget === 'note' ? "#fff" : "#6B7280"} />
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity
                            disabled={!canEditEverythingElse}
                            onPress={handleOpenCategorySheet}
                            style={[styles.categoryButton, !canEditEverythingElse && styles.readOnlyButton]}
                        >
                            <View style={[styles.iconWrapper, { borderColor: currentStatusColor, borderWidth: 1 }]}>
                                {getCategoryIconComponent(currentCategory.icon, currentStatusColor, 16)}
                            </View>
                            <Text style={styles.categoryButtonText}>{currentCategory.name}</Text>
                            <ChevronDown size={16} color="#333" style={{ marginLeft: 'auto' }} />
                        </TouchableOpacity>

                        <PinTagEditor
                            pinId={pin.id}
                            initialTags={(pin.pin_tags ?? []).map((pt) => pt.tags).filter(Boolean)}
                            onChange={(tags) => {
                                skipNextReloadRef.current = true;
                                setPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, pin_tags: tags.map(t => ({ tags: t })) } : p));
                            }}
                        />

                        <View style={styles.assigneeDueDateRow}>
                            <TouchableOpacity
                                disabled={!canEditEverythingElse}
                                onPress={handleOpenAssigneeSheet}
                                style={[assigneeButtonStyles, !canEditEverythingElse && styles.readOnlyButton]}
                            >
                                <View style={styles.iconWrapper}><UserPlus size={16} color="#333" /></View>
                                <Text style={assigneeTextStyles}>{assigneeName}</Text>
                                {assignee && (
                                    <TouchableOpacity style={styles.clearIconWrapper} onPress={handleClearAssignee}>
                                        <CloseIcon size={16} color="#333" />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                disabled={!canEditEverythingElse}
                                onPress={handleOpenDatePicker}
                                style={[dateButtonStyles, !canEditEverythingElse && styles.readOnlyButton]}
                            >
                                <View style={[styles.iconWrapper, isPast && styles.pastDueIconBorder]}>
                                    <Calendar size={16} color={isPast ? styles.pastDueText.color : "#333"} />
                                </View>
                                <Text style={dateTextStyles}>{due_date ? formatDate(due_date) : 'Date échéance'}</Text>
                                {due_date && (
                                    <TouchableOpacity style={styles.clearIconWrapper} onPress={handleClearDueDate}>
                                        <CloseIcon size={16} color="#333" />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        </View>

                        <View style={styles.assigneeDueDateRow}>
                            <TouchableOpacity style={[styles.actionButton, { borderColor: '#2563eb' }]} onPress={handleAddPhotosToCurrentPin}>
                                <View style={[styles.iconWrapper, { borderColor: '#2563eb', borderWidth: 1 }]}>
                                    <Camera size={16} color="#2563eb" />
                                </View>
                                <Text style={[styles.actionButtonText, { color: '#2563eb' }]}>Ajouter photos</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.actionButton, { borderColor: '#ec4899' }]} onPress={handleAddSnippetToCurrentPin}>
                                <View style={[styles.iconWrapper, { borderColor: '#ec4899', borderWidth: 1 }]}>
                                    <Scissors size={16} color="#ec4899" />
                                </View>
                                <Text style={[styles.actionButtonText, { color: '#ec4899' }]}>Ajouter snippet</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.pinLocationSection}>
                            {xcoordinate !== null && xcoordinate !== undefined &&
                            ycoordinate !== null && ycoordinate !== undefined ? (
                                <TouchableOpacity
                                    style={styles.pinLocationCard}
                                    onPress={() => {
                                        setPlanSelectorTarget('pin');
                                        const pdfInfo = { width: plan.width, height: plan.height, tilesPath: plan.tiles_path };
                                        router.push({
                                            pathname: '/PinPlacementScreen',
                                            params: {
                                                myplanid: planId,
                                                pinIdToPlace: pin.id,
                                                x: pin.x,
                                                y: pin.y,
                                                userRole: currentRole,
                                                pdfInfo: JSON.stringify(pdfInfo)
                                            }
                                        });
                                    }}
                                >
                                    <View style={styles.pinLocationHeader}>
                                        <View style={[styles.locationIconCircle, { backgroundColor: currentStatusColor }]}>
                                            <MapPin size={20} color="#fff" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.pinLocationTitle}>Position sur le plan</Text>
                                        </View>
                                        <ChevronRight size={20} color="#6B7280" />
                                    </View>
                                    <View style={styles.pinPreviewContainer}>
                                        <PlanMiniSnapshot pngUrl={planPngPublicUrl} x={xcoordinate} y={ycoordinate} pinColor={currentStatusColor} />
                                    </View>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.placePinButton, !canEditEverythingElse && styles.disabledButton]}
                                    onPress={() => {
                                        if (!canEditEverythingElse) return;
                                        setPlanSelectorTarget('pin');
                                        fetchProjectPlans();
                                        setShowPlanSelector(true);
                                    }}
                                    disabled={!canEditEverythingElse}
                                >
                                    <View style={styles.placePinContent}>
                                        <View style={styles.placePinIconCircle}><MapPin size={20} color="#2563eb" /></View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.placePinTitle}>Localiser sur le plan</Text>
                                            <Text style={styles.placePinSubtitle}>Placer cette tâche sur le plan PDF</Text>
                                        </View>
                                        <ChevronRight size={20} color="#2563eb" />
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.tabContainer}>
                            <TouchableOpacity style={[styles.tab, !showAllEvents && styles.activeTab]} onPress={() => setShowAllEvents(false)}>
                                <Text style={[styles.tabText, !showAllEvents && styles.activeTabText]}>Moins de mises à jour</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.tab, showAllEvents && styles.activeTab]} onPress={() => setShowAllEvents(true)}>
                                <Text style={[styles.tabText, showAllEvents && styles.activeTabText]}>Plus de mises à jour</Text>
                            </TouchableOpacity>
                        </View>

                        {(events || comments) && (
                            <Timeline
                                events={events}
                                comments={comments}
                                showAllEvents={showAllEvents}
                                onPlaceOnPlan={handleOpenPlanSelectorForPhoto}
                            />
                        )}
                    </ScrollView>
                </GestureDetector>

                {showDatePicker && (
                    <DateTimePicker
                        testID="dateTimePicker"
                        value={initialDate}
                        mode={'date'}
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={onChangeDate}
                        minimumDate={new Date()}
                    />
                )}

                <AssigneeSheet />
                <StatusSheet />
                <CategorySheet />
                <ActionsSheet />
                <PlanSelectorSheet />

                {/* ── Badge "En écoute" — visible tant que la dictée (nom, note ou commentaire) est active ── */}
                {isListening && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.listeningBadgeWrapper,
                            { bottom: commentBarBottomInset + COMMENT_BAR_HEIGHT + 14 },
                        ]}
                    >
                        <View style={styles.listeningBadge}>
                            <Text style={styles.listeningBadgeText}>En écoute</Text>
                        </View>
                    </View>
                )}

                {/* ── Comment bar with mic button — fond opaque jusqu'au bas de l'écran ── */}
                <View
                    style={[
                        styles.commentBarWrapper,
                        { paddingBottom: commentBarBottomInset },
                    ]}
                >
                    <View style={styles.commentBar}>
                        <TouchableOpacity
                            style={[styles.commentMicButton, isListening && dictationTarget === 'comment' && styles.commentMicButtonActive]}
                            onPress={handleDictateComment}
                            disabled={isListening && dictationTarget !== 'comment'}
                        >
                            <MicIcon size={20} color={isListening && dictationTarget === 'comment' ? "#fff" : "#6B7280"} />
                        </TouchableOpacity>
                        <TextInput
                            style={styles.commentInput}
                            value={isListening && dictationTarget === 'comment'
                                ? (commentText ? `${commentText} ${partialResult}` : partialResult) || commentText
                                : commentText
                            }
                            onChangeText={setCommentText}
                            placeholder="Ajouter un commentaire..."
                            placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                            style={[styles.sendButton, !commentText.trim() && styles.disabledButton]}
                            onPress={handleSendComment}
                            disabled={!commentText.trim()}
                        >
                            <SendIcon size={20} color={commentText.trim() ? "#fff" : "#ccc"} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
        gap: 8,
    },
    iconCircle: {
        backgroundColor: '#f3f4f6',
        borderRadius: 9999,
        padding: 6,
        justifyContent: 'center',
        alignItems: 'center',
        width: 36,
        height: 36,
    },
    middleIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    disabledButton: { opacity: 0.5 },
    scroll: { padding: 20 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    statusIconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    statusButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999, justifyContent: 'space-between', width: 150 },
    statusButtonText: { color: 'white', fontFamily: 'Outfit_400Regular', fontSize: 16 },
    idText: { color: '#6B7280', fontSize: 12, marginTop: 8, marginBottom: 10 },
    categoryButton: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    categoryButtonText: { color: '#333', fontFamily: 'Outfit_400Regular', fontSize: 14, marginLeft: 8 },
    assigneeDueDateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    pastDueBackground: { backgroundColor: '#fdecec' },
    pastDueBorder: { borderColor: '#f05252' },
    pastDueText: { color: '#f05252' },
    pastDueIconBorder: { borderColor: '#f05252', borderWidth: 1 },
    dateSelectedButton: { justifyContent: 'space-between', paddingRight: 8 },
    iconWrapper: { backgroundColor: 'white', borderRadius: 9999, padding: 6, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    actionButtonText: { color: '#333', fontFamily: 'Outfit_400Regular', fontSize: 14 },
    dateSelectedText: { flexShrink: 1, marginRight: 8 },
    clearIconWrapper: { backgroundColor: 'white', borderRadius: 9999, padding: 6, justifyContent: 'center', alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, maxHeight: '70%', width: '100%' },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
    sheetTitle: { fontSize: 18, fontFamily: 'Outfit_600SemiBold', color: '#111' },
    memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20 },
    memberText: { marginLeft: 10, fontSize: 16, color: '#333', fontFamily: 'Outfit_400Regular' },
    separator: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 20 },
    statusIndicator: { width: 12, height: 12, borderRadius: 6, marginLeft: 6, marginRight: 6 },
    categoryIconCircleSheet: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    actionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20 },
    actionText: { marginLeft: 10, fontSize: 16, color: '#333', fontFamily: 'Outfit_400Regular' },
    tabContainer: { flexDirection: 'row', alignSelf: 'center', borderRadius: 9999, backgroundColor: '#f3f4f6', marginVertical: 20 },
    tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 9999 },
    activeTab: { backgroundColor: '#2563eb' },
    tabText: { color: '#374151', fontSize: 14, fontFamily: 'Outfit_400Regular' },
    activeTabText: { color: '#fff', fontWeight: '600' },
    // ── Comment bar wrapper : couvre TOUT l'espace jusqu'au bas de l'écran, fond opaque ──
    commentBarWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        zIndex: 10,
    },
    commentBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
    },
    commentInput: { flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, fontFamily: 'Outfit_400Regular' },
    sendButton: { backgroundColor: '#2563eb', padding: 10, borderRadius: 9999, justifyContent: 'center', alignItems: 'center' },
    // ── Comment mic ───────────────────────────────────────────────────────────
    commentMicButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    commentMicButtonActive: {
        backgroundColor: '#2563eb',
    },
    // ── Badge "En écoute" ────────────────────────────────────────────────────
    listeningBadgeWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 20,
    },
    listeningBadge: {
        backgroundColor: '#000',
        paddingHorizontal: 22,
        paddingVertical: 12,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listeningBadgeText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: 'Outfit_600SemiBold',
    },
    inputContainerDictation: { flexDirection: 'row', alignItems: 'flex-start', position: 'relative', marginBottom: 10 },
    textAreaDictation: { flex: 1, fontSize: 24, fontFamily: 'Outfit_400Regular', marginTop: 12, marginRight: 40 },
    noteInputDictation: { flex: 1, fontSize: 18, fontFamily: 'Outfit_400Regular', marginTop: 8, marginRight: 40 },
    micButton: { position: 'absolute', right: 0, top: 18, padding: 5, borderRadius: 999, backgroundColor: '#f3f4f6' },
    micButtonNote: { position: 'absolute', right: 0, top: 14, padding: 5, borderRadius: 999, backgroundColor: '#f3f4f6' },
    micButtonActive: { backgroundColor: '#2563eb' },
    pinLocationSection: { marginTop: 16, marginBottom: 8 },
    pinLocationCard: { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 12 },
    pinLocationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    locationIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    pinLocationTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#111' },
    pinPreviewContainer: { borderRadius: 8, overflow: 'hidden' },
    placePinButton: { backgroundColor: '#eff6ff', borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', padding: 16 },
    placePinContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    placePinIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#dbeafe', justifyContent: 'center', alignItems: 'center' },
    placePinTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#2563eb' },
    placePinSubtitle: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 2 },
    planItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 20, gap: 12 },
    planIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
    planItemTitle: { fontSize: 16, fontFamily: 'Outfit_600SemiBold', color: '#111' },
    planItemSubtitle: { fontSize: 13, fontFamily: 'Outfit_400Regular', color: '#6B7280', marginTop: 2 },
    readOnlyInput: { backgroundColor: '#f5f5f5', color: '#71717a', borderColor: '#e4e4e7' },
    readOnlyButton: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', opacity: 0.7 },
    readOnlyText: { color: '#94a3b8' },
    readOnlyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: '#fecaca', gap: 4 },
    readOnlyBadgeText: { color: '#dc2626', fontSize: 12, fontWeight: '600', fontFamily: 'Outfit_600SemiBold' },
});