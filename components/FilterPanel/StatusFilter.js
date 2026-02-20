 // keep your import path consistent
import { useAtom } from 'jotai';
import { StyleSheet, Text, View } from 'react-native';
import { Switch } from 'react-native-switch';
import { statusesAtom } from '../../store/atoms';

export default function StatusFilter({ activeStatuses, setActiveStatuses, selectedProject }) {
  const [statuses, setStatuses] = useAtom(statusesAtom);
  console.log('Statuses:', statuses);
  
 

  const toggleStatus = (statusId) => {
    setActiveStatuses((prev) =>
      prev.includes(statusId)
        ? prev.filter((id) => id !== statusId)
        : [...prev, statusId]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        {statuses.map((status) => (
          <View key={status.id} style={styles.row}>
            <Text style={styles.label}>{status.name}</Text>
            <Switch
              value={activeStatuses.includes(status.id)}
              onValueChange={() => toggleStatus(status.id)}
          renderActiveText={false}
    renderInActiveText={false}
              circleBorderWidth={0}
              backgroundActive="#2563eb" // blue-600
              backgroundInactive="#d1d5db" // gray-300
              circleActiveColor="#fff"
              circleInActiveColor="#fff"
            />
          </View>
        ))}
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
    backgroundColor: '#f5f5f4', // stone-100
    borderWidth: 1,
    borderColor: '#d1d5db', // gray-300
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#374151', // gray-700
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    fontFamily: 'Outfit_600SemiBold',
  },
});
