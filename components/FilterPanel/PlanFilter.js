import { Feather } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Switch } from 'react-native-switch';
import { pinsAtom } from '../../store/atoms';

export default function PlanFilter({ active, onToggle, selectedPlans, setSelectedPlans }) {
    const [pins] = useAtom(pinsAtom);
    const [showBottomSheet, setShowBottomSheet] = useState(false);
    const [search, setSearch] = useState('');
    const safeSetSearch = (val) => setSearch(val ?? '');
    const insets = useSafeAreaInsets();

    // Derive unique plan names from pins
    const allPlans = [...new Set(pins.map((p) => p.pdf_name).filter(Boolean))].sort();

    const filteredPlans = allPlans.filter((plan) =>
        plan.toLowerCase().includes((search ?? '').toLowerCase())
    );

    const togglePlan = (plan) => {
        setSelectedPlans((prev) =>
            prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.innerContainer}>
                {/* Toggle row */}
                <View style={styles.row}>
                    <Text style={styles.label}>Filtrer par plan</Text>
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
                        {selectedPlans.length > 0 && (
                            <View style={styles.chipsRow}>
                                {selectedPlans.map((plan) => (
                                    <View key={plan} style={styles.chip}>
                                        <Text style={styles.chipText} numberOfLines={1}>{plan}</Text>
                                        <TouchableOpacity
                                            onPress={() => togglePlan(plan)}
                                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        >
                                            <Feather name="x" size={11} color="#6D28D9" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => setShowBottomSheet(true)}
                        >
                            <Feather name="file-text" size={14} color="#6D28D9" />
                            <Text style={styles.pickerButtonText}>
                                {selectedPlans.length > 0
                                    ? `${selectedPlans.length} plan(s) sélectionné(s)`
                                    : 'Choisir un plan...'}
                            </Text>
                            <Feather name="chevron-right" size={14} color="#6D28D9" style={{ marginLeft: 'auto' }} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Bottom sheet modal */}
            <Modal
                visible={showBottomSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowBottomSheet(false)}
            >
                <View style={styles.overlay}>
                    <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                        {/* Header */}
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Plans de projet</Text>
                            <TouchableOpacity onPress={() => setShowBottomSheet(false)}>
                                <Feather name="x" size={22} color="#333" />
                            </TouchableOpacity>
                        </View>

                        {/* Search bar */}
                        <View style={styles.searchRow}>
                            <Feather name="search" size={15} color="#9CA3AF" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Rechercher un plan..."
                                placeholderTextColor="#9CA3AF"
                                value={search}
                                onChangeText={safeSetSearch}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => safeSetSearch('')}>
                                    <Feather name="x-circle" size={15} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Plan list */}
                        {filteredPlans.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Text style={styles.emptyText}>Aucun plan trouvé</Text>
                            </View>
                        ) : (
                            <ScrollView
                                contentContainerStyle={{ paddingBottom: 16 }}
                                showsVerticalScrollIndicator={false}
                            >
                                {filteredPlans.map((plan) => {
                                    const isSelected = selectedPlans.includes(plan);
                                    return (
                                        <TouchableOpacity
                                            key={plan}
                                            style={[styles.planRow, isSelected && styles.planRowActive]}
                                            onPress={() => togglePlan(plan)}
                                        >
                                            <Feather
                                                name="file-text"
                                                size={15}
                                                color={isSelected ? '#6D28D9' : '#9CA3AF'}
                                                style={{ marginRight: 10 }}
                                            />
                                            <Text
                                                style={[styles.planName, isSelected && styles.planNameActive]}
                                                numberOfLines={1}
                                            >
                                                {plan}
                                            </Text>
                                            {isSelected && (
                                                <Feather
                                                    name="check"
                                                    size={16}
                                                    color="#6D28D9"
                                                    style={{ marginLeft: 'auto' }}
                                                />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}

                        {/* Confirm button */}
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
    // ── Outer shell — matches StatusFilter exactly ──────────────────────────
    container: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    innerContainer: {
        backgroundColor: '#f5f5f4',   // stone-100
        borderWidth: 1,
        borderColor: '#d1d5db',       // gray-300
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
        color: '#374151',             // gray-700
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
        fontFamily: 'Outfit_600SemiBold',
    },

    // ── Expanded area (chips + picker button) ───────────────────────────────
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

    // ── Bottom sheet ─────────────────────────────────────────────────────────
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 20,
        maxHeight: '70%',
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    sheetTitle: {
        fontSize: 18,
        fontFamily: 'Outfit_700Bold',
        color: '#111',
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Outfit_400Regular',
        color: '#111827',
    },
    planRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 4,
    },
    planRowActive: {
        backgroundColor: '#EDE9FE',
    },
    planName: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Outfit_400Regular',
        color: '#374151',
    },
    planNameActive: {
        fontFamily: 'Outfit_600SemiBold',
        color: '#6D28D9',
    },
    emptyBox: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        color: '#9CA3AF',
    },
    doneButton: {
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