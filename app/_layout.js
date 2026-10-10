// app/_layout.tsx
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
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F5F7FA' }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#111827' }}>
        Une erreur est survenue
      </Text>
      <Text style={{ color: '#4B5563', marginBottom: 16 }}>
        Vos modifications en attente sont conservées sur l'appareil. Relancez l'écran ; si l'erreur revient, envoyez-nous le message ci-dessous.
      </Text>
      <Text selectable style={{ fontFamily: 'Courier', fontSize: 12, color: '#991B1B', marginBottom: 24 }}>
        {String(error?.message ?? error)}
      </Text>
      <TouchableOpacity
        onPress={() => { retry(); }}
        style={{ backgroundColor: '#111827', borderRadius: 10, paddingVertical: 14, alignItems: 'center' }}
      >
        <Text style={{ color: 'white', fontWeight: '600' }}>Réessayer</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function RootLayout() {
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
            <Stack.Screen name="AccountScreen" options={{ headerShown: true, headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 } }} />
            <Stack.Screen name="select-project" options={{ headerShown: true, headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 } }} />
            <Stack.Screen name="PinPlacementScreen" options={{ headerShown: false }} />
            <Stack.Screen name="StorageDataScreen" options={{ headerShown: true, headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 } }} />
            <Stack.Screen name="discussions/chat" options={{ headerShown: true, headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 } }} />
          </Stack>
        </AuthGate>
        <OfflineScreen />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  )
}
