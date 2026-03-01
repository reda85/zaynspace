import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { useAtom } from 'jotai';
import {
  AirVentIcon,
  AlarmSmokeIcon,
  BrickWallIcon,
  BrushIcon,
  CheckCircle,
  CheckIcon,
  ConstructionIcon,
  DoorClosedIcon,
  DoorOpenIcon,
  DropletOffIcon,
  DropletsIcon,
  FireExtinguisherIcon,
  FlameIcon,
  FolderIcon,
  GripIcon,
  PackageIcon,
  PaintRoller,
  SnowflakeIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WifiIcon,
  ZapIcon,
} from 'lucide-react-native';
import { categoriesAtom, statusesAtom } from '../store/atoms';

const categoriesIcons = {
  'zap':               <ZapIcon color="white" />,
  'fire-extinguisher': <FireExtinguisherIcon color="white" />,
  'droplets':          <DropletsIcon color="white" />,
  'snowflake':         <SnowflakeIcon color="white" />,
  'doors':             <DoorClosedIcon color="white" />,
  'paint':             <PaintRoller color="white" />,
  'unassigned':        <CheckIcon color="white" />,
  'Non assigné':       <CheckIcon color="white" />,
  'carrelage':         <GripIcon color="white" />,
  'folder':            <FolderIcon color="white" />,
  'air-vent':          <AirVentIcon color="white" />,
  'alarm-smoke':       <AlarmSmokeIcon color="white" />,
  'check-circle':      <CheckCircle color="white" />,
  'package':           <PackageIcon color="white" />,
  'brick-wall':        <BrickWallIcon color="white" />,
  'brush-cleaning':    <BrushIcon color="white" />,
  'construction':      <ConstructionIcon color="white" />,
  'droplet-off':       <DropletOffIcon color="white" />,
  'door-open':         <DoorOpenIcon color="white" />,
  'trending-up':       <TrendingUpIcon color="white" />,
  'flame':             <FlameIcon color="white" />,
  'trending-down':     <TrendingDownIcon color="white" />,
  'wifi':              <WifiIcon color="white" />,
};

export default function MapPin({ pin, onPinPress }) {
  const [selectedPin, setSelectedPin] = React.useState(null);
  const [statuses] = useAtom(statusesAtom);
  const [categories] = useAtom(categoriesAtom);
  const isSelected = selectedPin?.id === pin.id;

  const iconName = categories.find(c => c.id === pin?.category_id)?.icon;
  const icon = categoriesIcons[iconName] ?? <CheckIcon color="white" />;

  const statusColor = statuses.find(s => s.id === pin?.status_id)?.color || 'gray';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPinPress(pin)}
      activeOpacity={0.8}
    >
      <View style={styles.pinWrapper}>
        {isSelected && <View style={styles.tailLine} />}

        <View
          style={[
            styles.circle,
            {
              backgroundColor: statusColor,
              transform: [{ scale: isSelected ? 1.25 : 1 }],
            },
          ]}
        >
          {icon}
        </View>

        {isSelected && (
          <View style={[styles.tailBar, { backgroundColor: statusColor }]} />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
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