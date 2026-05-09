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
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { categoriesAtom, statusesAtom } from '../../store/atoms';
 
const categoriesIcons = {
    'zap': ZapIcon,
    'fire-extinguisher': FireExtinguisherIcon,
    'droplets': DropletsIcon,
    'snowflake': SnowflakeIcon,
    'doors': DoorClosedIcon,
    'paint': PaintRoller,
    'unassigned': CheckIcon,
    'Non assigné': CheckIcon,
    'carrelage': GripIcon,
    'folder': FolderIcon,
    'air-vent': AirVentIcon,
    'alarm-smoke': AlarmSmokeIcon,
    'check-circle': CheckCircle,
    'package': PackageIcon,
    'brick-wall': BrickWallIcon,
    'brush-cleaning': BrushIcon,
    'construction': ConstructionIcon,
    'droplet-off': DropletOffIcon,
    'door-open': DoorOpenIcon,
    'trending-up': TrendingUpIcon,
    'flame': FlameIcon,
    'trending-down': TrendingDownIcon,
    'wifi': WifiIcon,
};
 
export default function LinkedPinItem({ itemId, onPress, isOwn }) {
    const [pin, setPin] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statuses] = useAtom(statusesAtom);
    const [categories] = useAtom(categoriesAtom);
 
    useEffect(() => {
        const fetchPin = async () => {
            try {
                const { data, error } = await supabase
                    .from('pdf_pins')
                    .select('*')
                    .eq('id', itemId)
                    .single();
 
                if (error) throw error;
                setPin(data);
            } catch (error) {
                console.error('Error fetching pin:', error);
            } finally {
                setLoading(false);
            }
        };
 
        fetchPin();
    }, [itemId]);
 
    // Get icon and color
    const category = categories.find(c => c.id === pin?.category_id);
    const IconComponent = categoriesIcons[category?.icon] || CheckIcon;
    const status = statuses.find(s => s.id === pin?.status_id);
    const statusColor = status?.color || '#6D28D9';
 
    if (loading) {
        return (
            <View style={{ 
                marginTop: 8, 
                padding: 10, 
                backgroundColor: 'rgba(109,40,217,0.08)', 
                flexDirection: 'row',
                borderRadius: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#6D28D9',
            }}>
                <ActivityIndicator size="small" color="#6D28D9" />
                <Text style={{ marginLeft: 10, color: 'black', fontSize: 14 }}>Chargement...</Text>
            </View>
        );
    }
 
    if (!pin) {
        return (
            <View style={{ 
                marginTop: 8, 
                padding: 10, 
                backgroundColor: 'rgba(109,40,217,0.08)', 
                flexDirection: 'row',
                borderRadius: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#6D28D9',
            }}>
                <View style={{ 
                    width: 28, 
                    height: 28, 
                    borderRadius: 14, 
                    backgroundColor: '#9CA3AF',
                    alignItems: 'center',
                    justifyContent: 'center',
                }} >
                    <CheckIcon size={16} color="white" />
                </View>
                <Text style={{ marginLeft: 10, color: isOwn ? '#EDE9FE' : 'black', fontSize: 14 }}>
                    Tâche introuvable
                </Text>
            </View>
        );
    }
 
    // EXACT COPY of your working yellow test - just with real data
    return (
        <TouchableOpacity 
            onPress={onPress}
            activeOpacity={0.7}
            style={{ 
                marginTop: 8, 
                padding: 10, 
                backgroundColor: 'rgba(109,40,217,0.08)', 
                flexDirection: 'row',
                borderRadius: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#6D28D9',
            }}
        >
            <View style={{ 
                width: 28, 
                height: 28, 
                borderRadius: 14, 
                backgroundColor: statusColor,
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <IconComponent size={16} color="white" />
            </View>
            <Text style={{ marginLeft: 10, color: isOwn ? '#EDE9FE' : 'black', fontSize: 14 }}>
                #{pin.pin_number} • {pin.name}
            </Text>
        </TouchableOpacity>
    );
}