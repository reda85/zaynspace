import { Lexend_800ExtraBold, useFonts } from '@expo-google-fonts/lexend';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';


export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    Lexend_800ExtraBold
  });

  if (!fontsLoaded) return null;

  const handleSignIn = async () => {
    setLoading(true);
    const { data,error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if(data){
      console.log("✅ Sign in successful, User ID:", data.user?.id);
     // router.replace('/(tabs)/acceuil');
    }

    if (error) {alert(error.message)}
    else {console.log("✅ Sign in successful, User ID:", data.user?.id);}
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Logo and Brand - Above Card */}
      <View style={styles.brandContainer}>
        <Image 
          source={require('../../assets/images/logo_blanc.png')} // Update with your logo path
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>zaynspace</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>Accédez à votre espace de projet</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="exemple@email.com"
            placeholderTextColor="#999"
            style={styles.input}
            returnKeyType='next'
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor="#999"
            style={styles.input}
          />
        </View>

        <TouchableOpacity
          onPress={handleSignIn}
          disabled={loading}
          style={[styles.button, loading && { opacity: 0.7 }]}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F6',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  brandName: {
    fontFamily: 'Lexend_800ExtraBold',
    fontSize: 28,
    color: '#1C1C1A',
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    fontFamily: 'Geist_700Bold',
    fontSize: 22,
    textAlign: 'center',
    color: '#1C1C1A',
  },
  subtitle: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    textAlign: 'center',
    color: '#5B5B56',
    marginBottom: 24,
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    color: '#33332F',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F3F3F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
    color: '#1C1C1A',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#2C4F91',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontFamily: 'Geist_700Bold',
    fontSize: 16,
  },
});