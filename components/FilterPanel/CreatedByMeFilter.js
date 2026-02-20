import { StyleSheet, Text, View } from 'react-native';
import { Switch } from 'react-native-switch';

export default function CreatedByMeFilter({ active, onToggle }) {
  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={styles.label}>Pins créés par moi</Text>
        <Switch
         renderActiveText={false}
    renderInActiveText={false}
          value={active}
          onValueChange={onToggle}
          circleSize={18}
          barHeight={20}
          circleBorderWidth={0}
          backgroundActive="#2563eb"
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
