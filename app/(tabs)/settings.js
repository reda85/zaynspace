import { router, useNavigation } from 'expo-router';
import { useAtom } from 'jotai';
import {
  ChevronRight,
  Database,
  HelpCircle,
  Info,
  LogOut,
  MessageCircle,
  X,
} from 'lucide-react-native';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { sessionAtom } from '../../store/atoms';

export default function SettingsScreen() {
  const [email, setEmail] = useState('');
  const [, setSession] = useAtom(sessionAtom);
  const navigation = useNavigation();

  const initials = email ? email[0].toUpperCase() : '?';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Paramètres du compte',
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerTitleStyle: {
        fontFamily: 'Outfit_700Bold',
        fontSize: 20,
        color: '#000',
      },
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 16 }}>
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
       headerTitleStyle: { fontFamily: 'Outfit_700Bold', fontSize: 24, color: 'black' },
    });
  }, [navigation]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) setEmail(data.user.email);
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    
    await supabase.auth.signOut();
    //console.log('Logged out');
   // setSession(null);
   // router.replace('/auth/sign-in');
  };

  const Row = ({ label, icon: Icon, onPress }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Icon size={18} color="#374151" />
        <Text style={styles.rowText}>{label}</Text>
      </View>
      <ChevronRight size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Profile */}
      <Text style={styles.sectionTitle}>Compte</Text>
<View style={styles.card}>
  <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => router.push('/AccountScreen')}>
    <View style={styles.rowLeft}>
      <View style={styles.smallAvatar}>
        <Text style={styles.smallAvatarText}>{initials}</Text>
      </View>

      <View>
        <Text style={styles.rowText}>Account</Text>
        <Text style={styles.subText}>{email}</Text>
      </View>
    </View>

    <ChevronRight size={20} color="#9CA3AF" />
  </TouchableOpacity>
</View>


      {/* Preferences */}
      <Text style={styles.sectionTitle}>Préférences</Text>
      <View style={styles.card}>
        <Row
          label="Stockage de données"
          icon={Database}
          onPress={() => {router.push('/StorageDataScreen')}}
        />
      </View>

      {/* Support */}
      <Text style={styles.sectionTitle}>Support</Text>
      <View style={styles.card}>
        <Row
          label="Centre d’aide"
          icon={HelpCircle}
          onPress={() => {}}
        />
        <View style={styles.separator} />
        <Row
          label="Service client"
          icon={MessageCircle}
          onPress={() => {}}
        />
      </View>

      {/* Other */}
      <Text style={styles.sectionTitle}>Autre</Text>
      <View style={styles.card}>
        <Row
          label="À propos"
          icon={Info}
          onPress={() => {}}
        />
      </View>

      {/* Logout pinned bottom */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutButton}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },

  /* Profile */
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Outfit_600SemiBold',
  },

  profileText: {
    flex: 1,
    marginLeft: 16,
  },

  name: {
    fontSize: 16,
    color: '#111827',
    fontFamily: 'Outfit_700Bold',
  },

  email: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: 'Outfit_400Regular',
  },

  /* Sections */
  sectionTitle: {
    marginTop: 24,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'Outfit_600SemiBold',
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  rowText: {
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Outfit_500Medium',
  },

  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 48,
  },

  /* Logout */
  logoutContainer: {
    marginTop: 'auto',
    padding: 20,
  },

  logoutButton: {
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

  logoutText: {
    color: '#DC2626',
    fontSize: 16,
    fontFamily: 'Outfit_600SemiBold',
  },
  smallAvatar: {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: '#111827',
  alignItems: 'center',
  justifyContent: 'center',
},

smallAvatarText: {
  color: '#FFFFFF',
  fontSize: 18,
  fontFamily: 'Outfit_600SemiBold',
},

subText: {
  fontSize: 14,
  color: '#6B7280',
  marginTop: 2,
  fontFamily: 'Outfit_400Regular',
},

});
