// app/(tabs)/_layout.js
import { Tabs } from 'expo-router';
import { Camera, CheckSquare, Folder, Home, Map, MessageSquare, Settings } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../constants/theme';

// Libellé d'onglet avec le trait de couleur sous l'onglet actif.
function TabLabel({ label, focused }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>{label}</Text>
      <View style={[styles.bar, focused && styles.barActive]} />
    </View>
  );
}

const tabLabel = (label) => function Label({ focused }) {
  return <TabLabel label={label} focused={focused} />;
};

const tabIcon = (Icon) => function TabIcon({ color }) {
  return <Icon color={color} size={22} strokeWidth={1.8} />;
};

export default function Layout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      initialRouteName="acceuil"
      screenOptions={{
        // Chaque onglet dessine son propre en-tête (components/ui/ScreenHeader).
        headerShown: false,
        tabBarActiveTintColor: C.encre,
        tabBarInactiveTintColor: C.mineClair,
        tabBarStyle: {
          backgroundColor: C.blanc,
          borderTopColor: C.filet,
          borderTopWidth: StyleSheet.hairlineWidth,
          // Assez haut pour l'icône, le libellé et le trait de l'onglet actif.
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 0,
          shadowOpacity: 0,
        },
      }}
    >
      <Tabs.Screen
        name="acceuil"
        options={{ title: 'Accueil', tabBarLabel: tabLabel('Accueil'), tabBarIcon: tabIcon(Home) }}
      />
      <Tabs.Screen
        name="plans/index"
        options={{ title: 'Plans', tabBarLabel: tabLabel('Plans'), tabBarIcon: tabIcon(Map) }}
      />
      <Tabs.Screen
        name="taches"
        options={{ title: 'Tâches', tabBarLabel: tabLabel('Tâches'), tabBarIcon: tabIcon(CheckSquare) }}
      />
      <Tabs.Screen
        name="medias"
        options={{ title: 'Médias', tabBarLabel: tabLabel('Médias'), tabBarIcon: tabIcon(Camera) }}
      />
      <Tabs.Screen
        name="documents"
        options={{ title: 'Documents', tabBarLabel: tabLabel('Documents'), tabBarIcon: tabIcon(Folder) }}
      />

      {/* Hors de la barre d'onglets : accessibles depuis l'en-tête de l'accueil */}
      <Tabs.Screen
        name="discussions"
        options={{ title: 'Discussions', tabBarIcon: tabIcon(MessageSquare), href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: C.papier },
          headerTitleStyle: { fontFamily: F.semibold, fontSize: 17, color: C.encre },
          tabBarIcon: tabIcon(Settings),
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  labelWrap: { alignItems: 'center' },
  label: { fontFamily: F.medium, fontSize: 10.5, color: C.mineClair },
  labelActive: { fontFamily: F.semibold, color: C.encre },
  bar: { marginTop: 3, width: 16, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  barActive: { backgroundColor: C.tirage },
});
