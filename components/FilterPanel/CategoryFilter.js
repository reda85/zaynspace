import { Feather } from '@expo/vector-icons';
import { useAtomValue } from 'jotai';
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
import { useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Switch } from 'react-native-switch';
import { categoriesAtom } from '../../store/atoms';

// ✅ Synced with IconPicker — all 22 icons covered
const getCategoryIconComponent = (iconName, color = 'white', size = 18) => {
  switch (iconName) {
    case 'zap':               return <ZapIcon color={color} size={size} />;
    case 'fire-extinguisher': return <FireExtinguisherIcon color={color} size={size} />;
    case 'droplets':          return <DropletsIcon color={color} size={size} />;
    case 'snowflake':         return <SnowflakeIcon color={color} size={size} />;
    case 'doors':             return <DoorClosedIcon color={color} size={size} />;
    case 'paint':             return <PaintRoller color={color} size={size} />;
    case 'unassigned':        return <CheckIcon color={color} size={size} />;
    case 'carrelage':         return <GripIcon color={color} size={size} />;
    case 'folder':            return <FolderIcon color={color} size={size} />;
    case 'air-vent':          return <AirVentIcon color={color} size={size} />;
    case 'alarm-smoke':       return <AlarmSmokeIcon color={color} size={size} />;
    case 'check-circle':      return <CheckCircle color={color} size={size} />;
    case 'package':           return <PackageIcon color={color} size={size} />;
    case 'brick-wall':        return <BrickWallIcon color={color} size={size} />;
    case 'brush-cleaning':    return <BrushIcon color={color} size={size} />;
    case 'construction':      return <ConstructionIcon color={color} size={size} />;
    case 'droplet-off':       return <DropletOffIcon color={color} size={size} />;
    case 'door-open':         return <DoorOpenIcon color={color} size={size} />;
    case 'trending-up':       return <TrendingUpIcon color={color} size={size} />;
    case 'flame':             return <FlameIcon color={color} size={size} />;
    case 'trending-down':     return <TrendingDownIcon color={color} size={size} />;
    case 'wifi':              return <WifiIcon color={color} size={size} />;
    default:                  return <CheckIcon color={color} size={size} />;
  }
};

export default function CategoryFilter({ active, onToggle, tags, setTags }) {
  const categories = useAtomValue(categoriesAtom);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const insets = useSafeAreaInsets();

  const toggleCategory = (categoryName) => {
    setTags((prev) =>
      prev.includes(categoryName)
        ? prev.filter((t) => t !== categoryName)
        : [...prev, categoryName]
    );
  };

  const removeTag = (tag) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const getCategoryByName = (name) =>
    categories?.find((c) => c.name === name);

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        {/* Toggle row */}
        <View style={styles.row}>
          <Text style={styles.label}>Filtrer par catégorie</Text>
          <Switch
            value={active}
            onValueChange={onToggle}
            renderActiveText={false}
            renderInActiveText={false}
            circleBorderWidth={0}
            backgroundActive="#2563eb"
            backgroundInactive="#d1d5db"
            circleActiveColor="#fff"
            circleInActiveColor="#fff"
          />
        </View>

        {/* Chips + picker button (shown when active) */}
        {active && (
          <View style={styles.expandedArea}>
            {tags.length > 0 && (
              <View style={styles.chipsRow}>
                {tags.map((tag) => {
                  const cat = getCategoryByName(tag);
                  return (
                    <View key={tag} style={styles.chip}>
                      {cat && (
                        <View style={styles.chipIcon}>
                          {getCategoryIconComponent(cat.icon, '#6D28D9', 11)}
                        </View>
                      )}
                      <Text style={styles.chipText} numberOfLines={1}>{tag}</Text>
                      <TouchableOpacity
                        onPress={() => removeTag(tag)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Feather name="x" size={11} color="#6D28D9" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowBottomSheet(true)}
            >
              <Feather name="tag" size={14} color="#6D28D9" />
              <Text style={styles.pickerButtonText}>
                {tags.length > 0
                  ? `${tags.length} catégorie(s) sélectionnée(s)`
                  : 'Choisir une catégorie...'}
              </Text>
              <Feather name="chevron-right" size={14} color="#6D28D9" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom sheet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showBottomSheet}
        onRequestClose={() => setShowBottomSheet(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choisir une catégorie</Text>
              <TouchableOpacity onPress={() => setShowBottomSheet(false)}>
                <Feather name="x" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={categories || []}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => {
                const isSelected = tags.includes(item.name);
                return (
                  <TouchableOpacity
                    style={styles.memberItem}
                    onPress={() => toggleCategory(item.name)}
                  >
                    <View style={[
                      styles.categoryIconCircleSheet,
                      { backgroundColor: isSelected ? '#6D28D9' : '#e5e7eb' }
                    ]}>
                      {getCategoryIconComponent(
                        item.icon,
                        isSelected ? '#fff' : '#6b7280',
                        18
                      )}
                    </View>
                    <Text style={[
                      styles.memberText,
                      isSelected && styles.memberTextActive
                    ]}>
                      {item.name}
                    </Text>
                    {isSelected && (
                      <CheckIcon
                        size={18}
                        color="#6D28D9"
                        style={{ marginLeft: 'auto' }}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setShowBottomSheet(false)}
            >
              <Text style={styles.doneButtonText}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  innerContainer: {
    backgroundColor: '#f5f5f4',
    borderWidth: 1,
    borderColor: '#d1d5db',
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
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    fontFamily: 'Outfit_600SemiBold',
  },
  expandedArea: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
    maxWidth: 180,
  },
  chipIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#6D28D9',
    flexShrink: 1,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  pickerButtonText: {
    fontSize: 12,
    fontFamily: 'Outfit_600SemiBold',
    color: '#6D28D9',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '70%',
    width: '100%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Outfit_600SemiBold',
    color: '#111',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  memberText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
    fontFamily: 'Outfit_400Regular',
  },
  memberTextActive: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#6D28D9',
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
  },
  categoryIconCircleSheet: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButton: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#6D28D9',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
  },
});