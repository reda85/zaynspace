import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';


import { useAtom } from 'jotai';
import {
  CheckIcon, DoorClosedIcon, DropletsIcon, FireExtinguisherIcon, GripIcon,
  PaintRoller,
  SnowflakeIcon,
  ZapIcon
} from 'lucide-react-native';
import { categoriesAtom, statusesAtom } from '../store/atoms';

const categoriesIcons = {
  'Non assigné' : <CheckIcon style={{ color: 'white' }}  />,
  'zap': <ZapIcon style={{ color: 'white' }} />,
  'droplets': <DropletsIcon style={{ color: 'white' }} />,
  'paint': <PaintRoller style={{ color: 'white' }} />,
  'carrelage': <GripIcon style={{ color: 'white' }} />,
  'fire-extinguisher': <FireExtinguisherIcon style={{ color: 'white' }} />,
  'doors': <DoorClosedIcon style={{ color: 'white' }} />,
  'snowflake': <SnowflakeIcon style={{ color: 'white' }} />,
}

const statusColors = {
  'En cours': '#16a34a',   // green-600
  'A valider': '#2563eb',  // blue-600
  'Termine': '#dc2626',    // red-600
};

export default function MapPin({ pin, onPinPress }) {
  const [selectedPin, setSelectedPin] = React.useState(null);
  const [statuses, setStatuses] = useAtom(statusesAtom);
  const [categories, setCategories] = useAtom(categoriesAtom);
  const isSelected = selectedPin?.id === pin.id;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPinPress(pin)}
      activeOpacity={0.8}
    >
      {/* Popover */}
   {/*   <View style={styles.popover}>
        <Text style={styles.popoverText}>{pin.category} - {pin.status}</Text>
        <Text style={styles.popoverText}>{pin.x} - {pin.y}</Text>
      </View>
*/}
      {/* Pin */}
      <View style={styles.pinWrapper}>
        {isSelected && <View style={styles.tailLine} />}

        <View
          style={[
            styles.circle,
            {
              backgroundColor: statuses.find(s => s.id === pin?.status_id)?.color || 'gray',
              transform: [{ scale: isSelected ? 1.25 : 1 }],
            },
          ]}
        >
          {categoriesIcons[categories.find(c => c.id === pin?.category_id)?.icon] || <CheckIcon style={{ color: 'white' }}  />}
        </View>

        {isSelected && (
          <View
            style={[
              styles.tailBar,
              { backgroundColor: statusColors[pin.status] },
            ]}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  popover: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#1f2937', // Tailwind gray-800
    borderRadius: 4,
    zIndex: 10,
  },
  popoverText: {
    fontSize: 12,
    color: 'white',
    textAlign: 'center',
  },
  pinWrapper: {
    alignItems: 'center',
  },
  tailLine: {
    width: 1,
    height: 8,
    backgroundColor: 'white',
    opacity: 0.8,
  },
  circle: {
    padding: 6,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tailBar: {
    width: 1,
    height: 24,
    marginTop: 4,
    borderRadius: 2,
  },
});
