import { StyleSheet, Text, View } from 'react-native';
import { Switch } from 'react-native-switch';

export default function OverdueFilter({ active, onToggle }) {
  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={styles.label}>Pins en retard</Text>
        <Switch
          value={active}
          onValueChange={onToggle}
          renderActiveText={false}
    renderInActiveText={false}
          circleBorderWidth={0}
          backgroundActive="#A8322A" // red-600
          backgroundInactive="#D3D3CE" // gray-300
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
    backgroundColor: '#f5f5f4', // stone-100
    borderWidth: 1,
    borderColor: '#D3D3CE', // gray-300
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    color: '#33332F', // gray-700
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    fontFamily: 'Outfit_600SemiBold',
  },
});
