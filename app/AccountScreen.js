import { router, useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import {
  Camera,
  Mail,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { useLayoutEffect } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loggedInUserAtom } from '../store/atoms';

export default function AccountScreen() {
  const navigation = useNavigation();
  const [user] = useAtom(loggedInUserAtom);


  
 // const [name, setName] = useState(user?.name);
  const name = user?.name;
  const email = user?.email;
  const memberStatus = user?.role === 'admin'
    ? 'Administrateur'
    : (['guest', 'Invités'].includes(user?.role) ? 'Invité' : 'Membre');
  const initials = (name || email || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  /* ---------- HEADER (same as Settings) ---------- */
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Compte',
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerTitleStyle: {
        fontFamily: 'Outfit_700Bold',
        fontSize: 20,
        color: '#000',
      },
      
     
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => router.back()}
         
        >
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
            <X size={24} color="#000" />
          </View>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  /* ---------- ACTIONS ---------- */
  const onChangePhoto = () => {
    console.log('Change photo');
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est définitive. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => console.log('Delete account'),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* PROFILE CARD */}
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={onChangePhoto}
          activeOpacity={0.8}
        >
          <Image
            source={{
              uri: user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=111827&color=fff`,
            }}
            style={styles.avatar}
          />
          <View style={styles.cameraBadge}>
            <Camera size={16} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <View style={styles.infoRow}>
          
            <User size={16} color="#6B7280" />
            <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Nom</Text>
            <Text style={styles.infoValue}>{name}</Text>
          </View>
         
        </View>
      </View>

      {/* INFO CARD */}
      <View style={styles.card}>
        
        <View style={styles.infoRow}>
          <Mail size={18} color="#6B7280" />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{email}</Text>
          </View>
        </View>

        <View style={styles.separator} />

        <View style={styles.infoRow}>
          <ShieldCheck size={18} color="#6B7280" />
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>Statut</Text>
            <Text style={styles.infoValue}>{memberStatus}</Text>
          </View>
        </View>
      </View>

      {/* DELETE ACCOUNT (BOTTOM) */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDeleteAccount}
          activeOpacity={0.85}
        >
          <Trash2 size={18} color="#DC2626" />
          <Text style={styles.deleteText}>Supprimer mon compte</Text>
        </TouchableOpacity>
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

  /* Cards */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginTop: 16,
  },

  avatarWrapper: {
    alignSelf: 'center',
    marginBottom: 20,
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E5E7EB',
  },

  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 6,
  },

  field: {
    marginTop: 8,
  },

  fieldLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },

  label: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
    color: '#6B7280',
  },

  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Outfit_500Medium',
    fontSize: 16,
    color: '#111827',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  infoText: {
    flex: 1,
  },

  infoLabel: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: '#6B7280',
  },

  infoValue: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: '#111827',
  },

  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },

  /* Footer */
  footer: {
    marginTop: 'auto',
    paddingVertical: 20,
  },

  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFFFFF',
  },

  deleteText: {
    color: '#DC2626',
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
  },
  headerBtnWhite: {
  backgroundColor: '#FFF',
  width: 36, height: 36, borderRadius: 18,
  alignItems: 'center', justifyContent: 'center',
  shadowColor: '#000', shadowOpacity: 0.06,
  shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 2,
},
});
