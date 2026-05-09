import { StyleSheet, Text, View } from 'react-native';
import { Switch } from 'react-native-switch';

export default function ArchivedFilter({ active, onToggle }) {
  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={styles.label}>Tâches archivées</Text>
        <Switch
          value={active}
          onValueChange={onToggle}
          renderActiveText={false}
          renderInActiveText={false}
          circleBorderWidth={0}
          backgroundActive="#6D28D9"
          backgroundInactive="#d1d5db"
          circleActiveColor="#fff"
          circleInActiveColor="#fff"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  innerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f4',
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    fontFamily: 'Outfit_600SemiBold',
  },
});