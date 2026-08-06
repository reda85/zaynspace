// app/_layout.tsx
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthGate } from '../components/AuthGate'
import { DeepLinkHandler } from '../components/DeepLinkHandler'
import { NetworkListener } from '../components/NetworkListener'
import { OfflineScreen } from '../components/OfflineScreen'

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
