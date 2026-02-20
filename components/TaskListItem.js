// components/TaskListItem.js

import { Feather } from '@expo/vector-icons';
import { MapPinned, MapPinOff } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Checkbox } from 'react-native-paper';

// ─── Custom Checkbox (iOS only) ───────────────────────────────────────────────
const CustomCheckbox = ({ checked, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: checked ? 'darkmagenta' : '#D1D5DB',
            backgroundColor: checked ? 'darkmagenta' : 'white',
            alignItems: 'center',
            justifyContent: 'center',
        }}
    >
        {checked && <Feather name="check" size={13} color="white" />}
    </TouchableOpacity>
);

// ─── Platform-aware Checkbox ──────────────────────────────────────────────────
const AppCheckbox = ({ checked, onPress }) => {
    if (Platform.OS === 'android') {
        return (
            <Checkbox
                status={checked ? 'checked' : 'unchecked'}
                onPress={onPress}
                color="darkmagenta"
            />
        );
    }
    return <CustomCheckbox checked={checked} onPress={onPress} />;
};

// ─── TaskListItem ─────────────────────────────────────────────────────────────
const TaskListItem = memo(({ 
    pin, 
    isSelected, 
    toggleSelect, 
    isLastInGroup,
    onNavigate,
}) => {
    const pinNumber = String(pin?.pin_number ?? 'N/A');
    const pdfName = String(pin?.pdf_name ?? 'N/A');
    const assignedName = String(pin.assigned_to?.name ?? 'Non assigné');
    const statusName = String(pin.Status?.name ?? 'N/A');

    const handleNavigate = useCallback(() => {
        onNavigate(pin.id);
    }, [onNavigate, pin.id]);

    const handleToggleSelect = useCallback(() => {
        toggleSelect(pin.id);
    }, [toggleSelect, pin.id]);

    return (
        <TouchableOpacity
            onPress={handleNavigate}
            style={[
                styles.itemContainer,
                isLastInGroup && { borderBottomWidth: 0 }
            ]}
        >
            <View style={styles.itemRow}>
                <View style={{ alignSelf: 'center' }}>
                    <AppCheckbox checked={isSelected} onPress={handleToggleSelect} />
                </View>

                <View style={styles.textColumn}>
                    <View style={styles.idPlanRow}>
                        <Text style={styles.pinIdText}>#{pinNumber}</Text>
                        {pin.pdf_name ? (
                            <View style={styles.pdfNamePill}>
                                <MapPinned size={14} color="#6B7280" />
                                <Text style={styles.pdfNameText}>{pdfName}</Text>
                            </View>
                        ) : (
                            <View style={styles.pdfNamePill}>
                                <MapPinOff size={14} color="#6B7280" />
                                <Text style={styles.pdfNameText}>Non localisée</Text>
                            </View>
                        )}
                    </View>

                    <Text style={styles.pinName}>{pin.name || 'Sans nom'}</Text>

                    <View style={styles.metaRow}>
                        {pin.assigned_to?.name ? (
                            <View style={styles.assigneePill}>
                                <Feather name="user" size={14} color="darkmagenta" />
                                <Text style={styles.assigneeText}>{assignedName}</Text>
                            </View>
                        ) : (
                            <View style={styles.noassigneePill}>
                                <Feather name="user" size={14} color="red" />
                                <Text style={styles.nonassigneeText}>Non assigné</Text>
                            </View>
                        )}
                        {pin.Status && (
                            <View style={[styles.statusPill, { backgroundColor: pin.Status?.color || '#E5E7EB' }]}>
                                <Text style={styles.statusText}>{statusName}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {pin.pins_photos?.length > 0 && pin.pins_photos[0].public_url ? (
                    <Image
                        source={{ uri: String(pin.pins_photos[0].public_url) }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={styles.thumbnailPlaceholder}>
                        <MapPinned size={22} color="#D1D5DB" />
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.pin === nextProps.pin &&
        prevProps.isSelected === nextProps.isSelected
    );
});

export default TaskListItem;

const styles = StyleSheet.create({
    itemContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderBottomWidth: 1,
        borderColor: '#E5E7EB',
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
    textColumn: { flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 6 },
    idPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    pinIdText: { fontSize: 12, color: '#6B7280', fontFamily: 'Outfit_400Regular' },
    pdfNamePill: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 },
    pdfNameText: { fontSize: 12, color: '#6B7280', fontFamily: 'Outfit_400Regular' },
    pinName: { fontSize: 15, color: '#111827', fontFamily: 'Outfit_600SemiBold' },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    assigneePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, gap: 4 },
    noassigneePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, gap: 4 },
    assigneeText: { fontSize: 12, color: '#7E22CE', fontFamily: 'Outfit_400Regular' },
    nonassigneeText: { fontSize: 12, color: 'red', fontFamily: 'Outfit_400Regular' },
    statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    statusText: { fontSize: 12, color: 'white', fontFamily: 'Outfit_400Regular' },
    thumbnail: { width: 80, height: 80, borderRadius: 10, marginLeft: 8, backgroundColor: '#F3F4F6' },
    thumbnailPlaceholder: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
});