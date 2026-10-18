// app/_layout.tsx
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit'
import { Stack } from 'expo-router'
import { Text, TouchableOpacity, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthGate } from '../components/AuthGate'
import { DeepLinkHandler } from '../components/DeepLinkHandler'
import { NetworkListener } from '../components/NetworkListener'
import { OfflineScreen } from '../components/OfflineScreen'

// Une erreur pendant l'affichage d'un écran fermait l'application (version
// publiée). Elle affiche maintenant ce message, avec le texte de l'erreur pour
// pouvoir la signaler, et un bouton pour relancer l'écran. Les modifications en
// attente d'envoi sont sur l'appareil et ne sont pas perdues.
export function ErrorBoundary({ error, retry }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F8F8F6' }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#1C1C1A' }}>
        Une erreur est survenue
      </Text>
      <Text style={{ color: '#5B5B56', marginBottom: 16 }}>
        Vos modifications en attente sont conservées sur l'appareil. Relancez l'écran ; si l'erreur revient, envoyez-nous le message ci-dessous.
      </Text>
      <Text selectable style={{ fontFamily: 'Courier', fontSize: 12, color: '#A8322A', marginBottom: 24 }}>
        {String(error?.message ?? error)}
      </Text>
      <TouchableOpacity
        onPress={() => { retry(); }}
        style={{ backgroundColor: '#1C1C1A', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function RootLayout() {
  // Polices de l'application, chargées une fois pour toute l'application.
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  })
  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NetworkListener />
        <AuthGate>
          <DeepLinkHandler />
          

          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

            <Stack.Screen name="PinMetadataScreen" options={{ headerShown: false }} />
            <Stack.Screen name="DrawingScreen" options={{ headerShown: false }} />
            <Stack.Screen name="CameraScreen" options={{ headerShown: false }} />
            <Stack.Screen name="ImageSnippetScreen" options={{ headerShown: false }} />
            <Stack.Screen name="AccountScreen" options={{ headerShown: true, headerStyle: { backgroundColor: '#F8F8F6', borderBottomWidth: 0 } }} />
            <Stack.Screen name="select-project" options={{ headerShown: true, headerStyle: { backgroundColor: '#F8F8F6', borderBottomWidth: 0 } }} />
            <Stack.Screen name="PinPlacementScreen" options={{ headerShown: false }} />
            <Stack.Screen name="StorageDataScreen" options={{ headerShown: true, headerStyle: { backgroundColor: '#F8F8F6', borderBottomWidth: 0 } }} />
            <Stack.Screen name="discussions/chat" options={{ headerShown: true, headerStyle: { backgroundColor: '#F8F8F6', borderBottomWidth: 0 } }} />
          </Stack>
        </AuthGate>
        <OfflineScreen />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )
}
