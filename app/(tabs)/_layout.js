// app/(tabs)/_layout.js
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import { Tabs } from 'expo-router';
import {
  Camera as CameraOutline, Camera as CameraSolid,
  CheckSquare as CheckOutline, CheckSquare as CheckSolid,
  Folder,
  Home as HomeOutline, Home as HomeSolid,
  Map as MapOutline, Map as MapSolid,
  MessageSquare,
  Table as TableOutline, Table as TableSolid
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Layout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  const insets = useSafeAreaInsets();

  if (!fontsLoaded) return null;

  const renderTabIcon = (OutlineIcon, SolidIcon) => ({ color, size, focused }) =>
    focused ? <SolidIcon color={color} size={size} /> : <OutlineIcon color={color} size={size} />;

  return (
    <Tabs
      initialRouteName="acceuil"
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        tabBarActiveTintColor: 'black',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
  borderTopWidth: 0,
  elevation: 0,
  shadowColor: 'transparent',
  backgroundColor: '#F5F7FA',
  paddingBottom: insets.bottom || 8,
  minHeight: 60 + (insets.bottom || 8),
},
        tabBarLabelStyle: {
          fontFamily: 'Outfit_500Medium',
        },
      }}
    >
      <Tabs.Screen
        name="acceuil"
        options={{
          headerShown: false,
          title: 'Acceuil',
          tabBarIcon: renderTabIcon(HomeOutline, HomeSolid),
        }}
      />

      <Tabs.Screen
        name="plans/index"
        options={{
          title: 'Plans',
          headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
          tabBarIcon: renderTabIcon(MapOutline, MapSolid),
        }}
      />

      <Tabs.Screen
        name="taches"
        options={{
          title: 'Tâches',
          headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
          tabBarIcon: renderTabIcon(CheckOutline, CheckSolid),
        }}
      />

      <Tabs.Screen
        name="medias"
        options={{
          title: 'Médias',
          headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
          tabBarIcon: renderTabIcon(CameraOutline, CameraSolid),
        }}
      />

      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
          tabBarIcon: renderTabIcon(Folder, Folder),
        }}
      />

      {/* Hidden from tab bar — accessible via navigation only */}
      <Tabs.Screen
        name="discussions"
        options={{
          title: 'Discussions',
          headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
          tabBarIcon: renderTabIcon(MessageSquare, MessageSquare),
          href: null, // hides from tab bar
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          headerStyle: { backgroundColor: '#F5F7FA', borderBottomWidth: 0 },
          tabBarIcon: renderTabIcon(TableOutline, TableSolid),
          href: null, // hides from tab bar
        }}
      />
    </Tabs>
  );
}