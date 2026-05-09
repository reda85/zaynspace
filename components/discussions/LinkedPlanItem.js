import { Map } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
 
export default function LinkedPlanItem({ itemId, onPress, isOwn }) {
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
 
    useEffect(() => {
        const fetchPlan = async () => {
            try {
                const { data, error } = await supabase
                    .from('plans')
                    .select('*')
                    .eq('id', itemId)
                    .single();
 
                if (error) throw error;
                setPlan(data);
            } catch (error) {
                console.error('Error fetching plan:', error);
            } finally {
                setLoading(false);
            }
        };
 
        fetchPlan();
    }, [itemId]);
 
    if (loading) {
        return (
            <View style={{ 
                marginTop: 8, 
                padding: 10, 
                backgroundColor: 'rgba(14,165,233,0.08)', 
                flexDirection: 'row',
                borderRadius: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#0EA5E9',
            }}>
                <ActivityIndicator size="small" color="#0EA5E9" />
                <Text style={{ marginLeft: 10, color: 'black', fontSize: 14 }}>Chargement...</Text>
            </View>
        );
    }
 
    if (!plan) {
        return (
            <View style={{ 
                marginTop: 8, 
                padding: 10, 
                backgroundColor: 'rgba(14,165,233,0.08)', 
                flexDirection: 'row',
                borderRadius: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#0EA5E9',
            }}>
                <View style={{ 
                    width: 28, 
                    height: 28, 
                    borderRadius: 14, 
                    backgroundColor: '#9CA3AF',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Map size={16} color="white" />
                </View>
                <Text style={{ marginLeft: 10, color: isOwn ? '#EDE9FE' : 'black', fontSize: 14 }}>
                    Plan introuvable
                </Text>
            </View>
        );
    }
 
    return (
        <TouchableOpacity 
            onPress={onPress}
            activeOpacity={0.7}
            style={{ 
                marginTop: 8, 
                padding: 10, 
                backgroundColor: 'rgba(14,165,233,0.08)', 
                flexDirection: 'row',
                borderRadius: 12,
                borderLeftWidth: 3,
                borderLeftColor: '#0EA5E9',
            }}
        >
            <View style={{ 
                width: 28, 
                height: 28, 
                borderRadius: 14, 
                backgroundColor: '#0EA5E9',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <Map size={16} color="white" />
            </View>
            <Text style={{ marginLeft: 10, color: isOwn ? '#EDE9FE' : 'black', fontSize: 14 }}>
                 {plan.name}
            </Text>
        </TouchableOpacity>
    );
}