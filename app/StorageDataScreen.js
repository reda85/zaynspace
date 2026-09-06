import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useNavigation } from 'expo-router';
import { BoxIcon, Image, Shrink, X } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/* ---- Storage keys ---- */
const KEYS = {
  autoSaveImages: '@settings/autoSaveImages',
  compressImages: '@settings/compressImages',
  optimizeStorage: '@settings/optimizeStorage',
};

export default function StorageDataScreen() {
  const navigation = useNavigation();

  const [autoSaveImages, setAutoSaveImages] = useState(true);
  const [dataOption1, setDataOption1] = useState(false);   // compressImages
  const [dataOption2, setDataOption2] = useState(true);    // optimizeStorage
  const [loading, setLoading] = useState(true);

  /* ---------- LOAD PERSISTED VALUES ---------- */
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [autoSave, compress, optimize] = await AsyncStorage.multiGet([
          KEYS.autoSaveImages,
          KEYS.compressImages,
          KEYS.optimizeStorage,
        ]);

        // multiGet returns [key, value] pairs; value is null if not yet set
        if (autoSave[1] !== null)   setAutoSaveImages(autoSave[1] === 'true');
        if (compress[1] !== null)   setDataOption1(compress[1] === 'true');
        if (optimize[1] !== null)   setDataOption2(optimize[1] === 'true');
      } catch (e) {
        console.warn('Failed to load storage preferences:', e);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  /* ---------- TOGGLE HELPERS ---------- */
  const handleToggle = async (
    key,
    value,
    setter,
  ) => {
    setter(value);
    try {
      await AsyncStorage.setItem(key, String(value));
    } catch (e) {
      console.warn(`Failed to save preference for ${key}:`, e);
    }
  };

  /* ---------- HEADER ---------- */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Stockage et données',
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerTitleStyle: {
        fontFamily: 'Outfit_700Bold',
        fontSize: 24,
        color: 'black',
        backgroundColor: '#F5F7FA',
      },
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} >
          <View style={styles.closeButton}>
            <X size={24} color="#000" />
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  /* ---------- LOADING STATE ---------- */
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* SECTION TITLE */}
      <Text style={styles.sectionTitle}>Stockage</Text>

      {/* STORAGE CARD */}
      <View style={styles.card}>
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Image size={20} color="#6B7280" />
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>Sauvegarde automatique des données</Text>
              <Text style={styles.menuSubtitle}>
                Retrouvez toutes les images de votre projet dans votre galerie
              </Text>
            </View>
          </View>
          <Switch
            value={autoSaveImages}
            onValueChange={(v) => handleToggle(KEYS.autoSaveImages, v, setAutoSaveImages)}
            trackColor={{ false: '#E5E7EB', true: '#60A5FA' }}
            thumbColor={autoSaveImages ? '#3B82F6' : '#F3F4F6'}
          />
        </View>
      </View>

      {/* SECTION TITLE - DONNÉES */}
      <Text style={styles.sectionTitle}>Données</Text>

      {/* DATA CARD */}
      <View style={styles.card}>
        {/* Compress images */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <Shrink size={20} color="#6B7280" />
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>Compresser les images</Text>
              <Text style={styles.menuSubtitle}>
                Envoyer des images en basse résolution pour économiser des données
              </Text>
            </View>
          </View>
          <Switch
            value={dataOption1}
            onValueChange={(v) => handleToggle(KEYS.compressImages, v, setDataOption1)}
            trackColor={{ false: '#E5E7EB', true: '#60A5FA' }}
            thumbColor={dataOption1 ? '#3B82F6' : '#F3F4F6'}
          />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Optimize storage */}
        <View style={styles.menuItem}>
          <View style={styles.menuLeft}>
            <BoxIcon size={20} color="#6B7280" />
            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>Optimiser le stockage</Text>
              <Text style={styles.menuSubtitle}>
                Enregistrer uniquement les images récentes pour économiser de l'espace
              </Text>
            </View>
          </View>
          <Switch
            value={dataOption2}
            onValueChange={(v) => handleToggle(KEYS.optimizeStorage, v, setDataOption2)}
            trackColor={{ false: '#E5E7EB', true: '#60A5FA' }}
            thumbColor={dataOption2 ? '#3B82F6' : '#F3F4F6'}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingHorizontal: 16,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Header */
  closeButton: {
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

  /* Section Title */
  sectionTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: '#6B7280',
    marginTop: 24,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* Cards */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },

  /* Menu Item */
  menuItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },

  menuLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },

  menuText: {
    flex: 1,
  },

  menuTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: '#111827',
    marginBottom: 4,
  },

  menuSubtitle: {
    fontFamily: 'Outfit_400Regular',
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  /* Divider */
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
});