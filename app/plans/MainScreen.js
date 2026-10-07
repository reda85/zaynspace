/* use client */

import { Camera } from 'expo-camera';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import 'react-native-url-polyfill/auto';
import { addPinToSupabase, deletePinFromSupabase, loadPinsFromSupabase, updatePinInSupabase } from '../../services/supabaseService.js';

import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useAtom, useAtomValue } from 'jotai';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import PdfViewerWithTiles from '../../components/PdfViewerWithTiles.js';
import { cachedSelect, readCache, syncTickAtom } from '../../lib/offline';
import { supabase } from '../../lib/supabase.js';
import { loggedInUserAtom, pinsAtom, selectedProjectAtom } from '../../store/atoms.js';

export default function MainScreen() {
    const { myuri, myname, myplanid } = useLocalSearchParams();
    const navigation = useNavigation();
    const isFocused = useIsFocused();

    const [pdfInfo, setPdfInfo] = useState(null);
    const [imageName, setImageName] = useState(null);
    const [pins, setPins] = useState([]);
    const [cameraPermission, setCameraPermission] = useState(null);

    // ── Two separate loaders: one blocks the viewer, one doesn't ─────────────
    const [loadingPdf, setLoadingPdf] = useState(false);   // blocks render
    const [loadingPins, setLoadingPins] = useState(false);  // silent — viewer already visible

    const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom);
    const [loggedInUser, setLoggedInUser] = useAtom(loggedInUserAtom);
    const [pinsState, setPinsState] = useAtom(pinsAtom);
    const [planId, setPlanId] = useState(null);
    const syncTick = useAtomValue(syncTickAtom);

    // Header configuration
    useEffect(() => {
        if (myname && myplanid) {
            setImageName(myname);
            setPlanId(myplanid);

            navigation.setOptions({
                title: myname,
                headerTitleAlign: 'center',
                headerTitleStyle: {
                    fontFamily: 'Outfit_700Bold',
                    fontSize: 20,
                    color: 'black',
                },
                headerLeft: () => (
                    <TouchableOpacity
                        onPress={() => router.navigate('/plans')}
                        style={{ paddingRight: 10, paddingVertical: 5 }}
                    >
                        <ChevronLeft color="black" size={24} />
                    </TouchableOpacity>
                ),
            });
        }
    }, [myname, myplanid]);

    // ── Fetch PDF metadata (blocks viewer until ready) ────────────────────────
    const fetchPdfInfo = useCallback(async () => {
        if (!myplanid) return;

        try {
            setLoadingPdf(true);

            let { data, error } = await cachedSelect(`plan-info-${myplanid}`, () => supabase
                .from('plans')
                .select('width, height, tiles_path, status, pages')
                .eq('id', myplanid)
                .single());

            // Hors ligne et plan jamais ouvert : ses dimensions sont dans la liste des plans du projet.
            if (error?.offline && selectedProject?.id) {
                const list = await readCache(`plans-${selectedProject.id}`);
                const fromList = (list ?? []).find((p) => p.id === myplanid);
                if (fromList) { data = fromList; error = null; }
            }
            if (error?.offline) {
                Alert.alert(
                    'Indisponible hors ligne',
                    "Ce plan n'a pas encore été chargé sur cet appareil.",
                    [{ text: 'OK', onPress: () => router.navigate('/plans') }],
                );
                return;
            }

            if (error) throw error;
            if (!data) throw new Error('Plan not found');

            if (data.status === 'processing') {
                Alert.alert(
                    'PDF en cours de traitement',
                    `Ce PDF est encore en cours de traitement. Veuillez patienter.`,
                    [{ text: 'Recharger', onPress: () => fetchPdfInfo() }, { text: 'OK' }]
                );
                return;
            }

            if (data.status === 'failed') {
                Alert.alert('Erreur de traitement', `Ce PDF n'a pas pu être traité.`);
                return;
            }

            if (data.status !== 'ready') {
                Alert.alert('PDF non disponible', `Statut du PDF : ${data.status}`);
                return;
            }

            const maxZoom = Math.ceil(Math.log2(Math.max(data.width, data.height)));

            setPdfInfo({
                width: data.width,
                height: data.height,
                tilesPath: data.tiles_path,
                maxZoom,
                pages: data.pages || 1,
            });
        } catch (error) {
            console.error('❌ Failed to load PDF info:', error);
            if (error.code === 'PGRST116') {
                Alert.alert('Plan introuvable', "Ce plan n'existe pas ou a été supprimé.");
            } else {
                Alert.alert('Erreur', `Impossible de charger le PDF: ${error.message || 'Erreur inconnue'}`);
            }
        } finally {
            setLoadingPdf(false);  // ← unblocks the viewer
        }
    }, [myplanid, selectedProject?.id]);

    useEffect(() => {
        if (isFocused && myplanid) {
            fetchPdfInfo().catch(console.error);
        }
    }, [isFocused, myplanid, fetchPdfInfo]);

    // Request camera permission
    useEffect(() => {
        (async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setCameraPermission(status === 'granted');
        })();
    }, []);

    // ── Load pins — silently, viewer is already showing ───────────────────────
    const loadPins = useCallback(async () => {
        if (!planId) return;

        try {
            setLoadingPins(true);
            const { pins: supabasePins = [] } = await loadPinsFromSupabase(planId, loggedInUser, selectedProject?.id);
            setPins(supabasePins);
            setPinsState(supabasePins);
        } catch (error) {
            console.error('Erreur de chargement des pins:', error);
            Alert.alert('Erreur', 'Impossible de charger les pins');
            setPins([]);
        } finally {
            setLoadingPins(false);
        }
    }, [planId, loggedInUser, selectedProject?.id]);

    // ── Clear stale pins the moment planId changes ────────────────────────────
    // This fires before the loadPins effect, ensuring the viewer
    // never sees pins from a previous plan while the fetch is in flight.
    useEffect(() => {
        setPins([]);
        setPinsState([]);
    }, [planId]);

    // ── Pins load once pdfInfo is ready — no second spinner ──────────────────
    useEffect(() => {
        if (isFocused && planId && pdfInfo) {
            loadPins();
        }
    }, [isFocused, planId, pdfInfo, loadPins, syncTick]);

    // ── Pin handlers ──────────────────────────────────────────────────────────
    const handlePinDrop = async (pdfCoordinates) => {
        try {
            const newPin = {
                id: uuid.v4(),
                x: pdfCoordinates.x,
                y: pdfCoordinates.y,
                name: `Pin ${pins.length + 1}`,
                note: '',
                category_id: null,
                status_id: null,
                created_at: new Date().toISOString(),
                created_by: loggedInUser.id,
                updated_at: new Date().toISOString(),
                updated_by: loggedInUser.id,
                pdf_name: imageName,
                plan_id: planId,
                project_id: selectedProject?.id,
            };

            await addPinToSupabase(planId, newPin, loggedInUser.id);
            setPins(prev => [...prev, newPin]);
            setPinsState(prev => [...prev, newPin]);
            Alert.alert('✅', 'Pin créé avec succès');
        } catch (error) {
            console.error('Erreur de création du pin:', error);
            Alert.alert('Erreur', 'Échec de création du pin');
        }
    };

    const handlePinUpdate = async (updatedPin) => {
        try {
            if (!updatedPin.id || !pins.find(p => p.id === updatedPin.id)) {
                if (!updatedPin.id) updatedPin.id = uuid.v4();
                await addPinToSupabase(planId, updatedPin, loggedInUser.id);
            }
            // Pin existant : la modification est déjà enregistrée (ou mise en
            // attente) par l'afficheur ; seul l'état local est mis à jour ici.

            setPins(prev =>
                prev.some(p => p.id === updatedPin.id)
                    ? prev.map(p => p.id === updatedPin.id ? updatedPin : p)
                    : [...prev, updatedPin]
            );
            setPinsState(prev =>
                prev.some(p => p.id === updatedPin.id)
                    ? prev.map(p => p.id === updatedPin.id ? updatedPin : p)
                    : [...prev, updatedPin]
            );
        } catch (error) {
            console.error('Erreur de mise à jour du pin:', error);
            Alert.alert('Erreur', 'Échec de mise à jour du pin');
        }
    };

    const handlePinDelete = async (pinId) => {
        try {
            await deletePinFromSupabase(pinId);
            setPins(prev => prev.filter(p => p.id !== pinId));
            setPinsState(prev => prev.filter(p => p.id !== pinId));
            Alert.alert('✅', 'Pin supprimé avec succès');
        } catch (error) {
            console.error('Erreur de suppression du pin:', error);
            Alert.alert('Erreur', 'Échec de suppression du pin');
        }
    };

    // ── Render guards ─────────────────────────────────────────────────────────

    // Unmount when screen loses focus
    if (!isFocused) {
        return <View style={styles.container} />;
    }

    // Only block on PDF info — pins load silently after
    if (loadingPdf || !pdfInfo) {
        return (
            <SafeAreaView style={styles.container} edges={'bottom'}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2196F3" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={'bottom'}>
            <View style={styles.pdfContainer}>
                <PdfViewerWithTiles
                    planId={myplanid}
                    pdfInfo={pdfInfo}
                    pins={pinsState}
                    myuri={myuri}
                    myname={myname}
                    onPinDrop={handlePinDrop}
                    onPinUpdate={handlePinUpdate}
                    onPinDelete={handlePinDelete}
                    enablePinDrop={true}
                    pdfName={imageName}
                    selectedProject={selectedProject}
                    plan_id={planId}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f0f0f0',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pdfContainer: {
        flex: 1,
        position: 'relative',
    },
});