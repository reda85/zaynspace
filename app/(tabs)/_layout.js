// app/(tabs)/_layout.js
import { Tabs } from 'expo-router';
import { Camera, CheckSquare, Folder, Home, Map, MessageSquare, Settings } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
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
  return <Icon color={color} size={21} strokeWidth={1.8} />;
};

function TabBarBackground() {
  return <View style={styles.background} />;
}

export default function Layout() {
  return (
    <Tabs
      initialRouteName="acceuil"
      screenOptions={{
        // Chaque onglet dessine son propre en-tête (components/ui/ScreenHeader).
        headerShown: false,
        tabBarActiveTintColor: C.encre,
        tabBarInactiveTintColor: C.mineClair,
        // Pas de tabBarStyle (hauteur, marges) : sur iOS, il rend les onglets
        // inactifs (déjà corrigé ainsi en août). La couleur passe par le fond.
        tabBarBackground: TabBarBackground,
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
  bar: { marginTop: 2, width: 16, height: 2.5, borderRadius: 2, backgroundColor: 'transparent' },
  background: {
    position: 'absolute', top: -2, left: 0, right: 0, bottom: 0, // couvre le trait natif
    backgroundColor: C.papier,
  },
  barActive: { backgroundColor: C.tirage },
});
