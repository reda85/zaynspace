import * as Audio from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Send as SendIcon, Zap as ZapIcon } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase'; // Assurez-vous que le chemin vers votre client Supabase est correct

// ====================================================================
// COMPOSANT: VoiceInput.jsx
// Gère l'enregistrement audio et l'appel IA pour l'analyse Darija.
// ====================================================================

/**
 * Simule l'appel à votre Edge Function Supabase pour l'analyse IA.
 * @param {string} audioUri - URI local du fichier audio à uploader.
 * @param {string} userId - ID de l'utilisateur (pour le contexte de sécurité/permissions).
 * @returns {Promise<{name: string, note: string, category_id: string} | null>} Données structurées.
 */
async function analyzeAudioWithAI(audioUri, userId) {
    // 1. Uploader l'audio vers Supabase Storage
    const fileExt = audioUri.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const storagePath = `audio_pins/${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('pin_files') // Assurez-vous que 'pin_files' est le nom de votre bucket
        .upload(storagePath, audioUri, {
            contentType: `audio/${fileExt}`,
            upsert: false,
        });

    if (uploadError) {
        console.error('Erreur Upload Supabase:', uploadError);
        Alert.alert('Erreur', "Échec de l'upload audio. Vérifiez votre connexion ou les permissions.");
        return null;
    }
    
    // 2. Appeler l'Edge Function Supabase pour l'analyse IA
    // Dans la réalité, vous appelleriez ici votre fonction qui exécute Whisper + GPT-4o.
    
    // *****************************************************************
    // ATTENTION: Ceci est une simulation. REMPLACEZ cette section 
    // par l'appel réel à votre Edge Function de traitement IA.
    // *****************************************************************
    
    console.log(`Audio uploadé à: ${storagePath}. Appel simulé à l'IA...`);
    
    // SIMULATION D'UN TEMPS DE TRAITEMENT LONG
    await new Promise(resolve => setTimeout(resolve, 3000)); 

    // SIMULATION DES DONNÉES STRUCTURÉES RETOURNÉES PAR GPT-4o
    const simulatedResponse = {
        name: 'Problème électrique critique',
        note: 'Le câblage de la prise dans la cuisine est exposé et a besoin d\'être refait immédiatement. Risque de court-circuit élevé.',
        category_id: 'c4e3e3b7-7b6c-4e5c-9c7f-9b2f6c0d4a9d', // Exemple d'ID de catégorie "Électricité"
    };
    
    return simulatedResponse;
}


export default function VoiceInput({ onDataProcessed }) {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const recordingRef = useRef(null);
    const currentUserId = 'user_dummy_id'; // REMPLACER par l'ID réel de l'utilisateur connecté

    // 1. Démarrer l'enregistrement
    const startRecording = async () => {
        if (isProcessing) return;

        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            setIsRecording(true);
            console.log('Enregistrement démarré.');
        } catch (err) {
            console.error('Erreur démarrage enregistrement:', err);
            Alert.alert('Microphone', "Échec de l'enregistrement. Vérifiez les permissions.");
        }
    };

    // 2. Arrêter l'enregistrement et traiter
    const stopRecordingAndProcess = async () => {
        if (!recordingRef.current) return;

        setIsRecording(false);
        setIsProcessing(true); 

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            
            // 3. Appel à la fonction IA/upload
            if (uri) {
                const aiData = await analyzeAudioWithAI(uri, currentUserId);
                
                if (aiData) {
                    onDataProcessed(aiData);
                }
                
                // Nettoyage de l'audio local après traitement
                await FileSystem.deleteAsync(uri); 
            }
        } catch (error) {
            console.error('Erreur arrêt/traitement audio:', error);
            Alert.alert('Erreur IA', "Le traitement de l'audio a échoué.");
        } finally {
            recordingRef.current = null;
            setIsProcessing(false);
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        }
    };

    const handlePress = isRecording ? stopRecordingAndProcess : startRecording;

    const buttonStyle = [
        styles.container,
        isRecording && styles.containerRecording,
        isProcessing && styles.containerProcessing,
    ];

    const iconColor = isRecording ? '#fff' : isProcessing ? '#fff' : '#2563eb';
    
    return (
        <TouchableOpacity 
            style={buttonStyle}
            onPress={handlePress}
            disabled={isProcessing}
        >
            {isProcessing ? (
                <>
                    <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                    <Text style={styles.textProcessing}>Analyse IA en cours...</Text>
                </>
            ) : isRecording ? (
                <>
                    <SendIcon size={20} color={iconColor} style={{ transform: [{ rotate: '45deg' }] }} />
                    <Text style={styles.textRecording}>Arrêter l'enregistrement et analyser</Text>
                </>
            ) : (
                <>
                    <ZapIcon size={20} color={iconColor} />
                    <Text style={styles.textDefault}>Enregistrer l'audio (Darija/IA)</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#2563eb', // Bleu par défaut
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
        elevation: 2,
    },
    containerRecording: {
        borderColor: '#ef4444', // Rouge pendant l'enregistrement
        backgroundColor: '#ef4444',
    },
    containerProcessing: {
        borderColor: '#6366f1', // Violet pendant l'analyse
        backgroundColor: '#6366f1',
    },
    textDefault: {
        marginLeft: 8,
        color: '#2563eb',
        fontWeight: '600',
        fontSize: 15,
    },
    textRecording: {
        marginLeft: 8,
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    textProcessing: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
});