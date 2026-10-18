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
import { membersAtom } from '../../store/atoms';

const NO_ASSIGNEE_KEY = '__no_assignee__';

export default function AssignedToFilter({ active, onToggle, selectedMembers, setSelectedMembers }) {
    const [members] = useAtom(membersAtom);
    const [showBottomSheet, setShowBottomSheet] = useState(false);
    const [search, setSearch] = useState('');
    const safeSetSearch = (val) => setSearch(val ?? '');
    const insets = useSafeAreaInsets();

    const filteredMembers = members.filter((m) =>
        m.name?.toLowerCase().includes((search ?? '').toLowerCase())
    );

    const toggleMember = (id) => {
        setSelectedMembers((prev) =>
            prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
        );
    };

    const getDisplayName = (id) => {
        if (id === NO_ASSIGNEE_KEY) return 'Non assigné';
        return members.find((m) => m.id === id)?.name ?? id;
    };

    return (
        <View style={styles.container}>
            <View style={styles.innerContainer}>
                {/* Toggle row */}
                <View style={styles.row}>
                    <Text style={styles.label}>Filtrer par assigné</Text>
                    <Switch
                        value={active}
                        onValueChange={onToggle}
                        renderActiveText={false}
                        renderInActiveText={false}
                        circleBorderWidth={0}
                        backgroundActive="#2C4F91"
                        backgroundInactive="#D3D3CE"
                        circleActiveColor="#fff"
                        circleInActiveColor="#fff"
                    />
                </View>

                {/* Chips + picker button (shown when active) */}
                {active && (
                    <View style={styles.expandedArea}>
                        {selectedMembers.length > 0 && (
                            <View style={styles.chipsRow}>
                                {selectedMembers.map((id) => (
                                    <View key={id} style={styles.chip}>
                                        <Text style={styles.chipText} numberOfLines={1}>
                                            {getDisplayName(id)}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => toggleMember(id)}
                                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        >
                                            <Feather name="x" size={11} color="#2C4F91" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => setShowBottomSheet(true)}
                        >
                            <Feather name="users" size={14} color="#2C4F91" />
                            <Text style={styles.pickerButtonText}>
                                {selectedMembers.length > 0
                                    ? `${selectedMembers.length} membre(s) sélectionné(s)`
                                    : 'Choisir un membre...'}
                            </Text>
                            <Feather name="chevron-right" size={14} color="#2C4F91" style={{ marginLeft: 'auto' }} />
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
                            <Text style={styles.sheetTitle}>Membres</Text>
                            <TouchableOpacity onPress={() => setShowBottomSheet(false)}>
                                <Feather name="x" size={22} color="#333" />
                            </TouchableOpacity>
                        </View>

                        {/* Search bar */}
                        <View style={styles.searchRow}>
                            <Feather name="search" size={15} color="#8A8A84" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Rechercher un membre..."
                                placeholderTextColor="#8A8A84"
                                value={search}
                                onChangeText={safeSetSearch}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => safeSetSearch('')}>
                                    <Feather name="x-circle" size={15} color="#8A8A84" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Member list */}
                        {filteredMembers.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Text style={styles.emptyText}>Aucun membre trouvé</Text>
                            </View>
                        ) : (
                            <ScrollView
                                contentContainerStyle={{ paddingBottom: 16 }}
                                showsVerticalScrollIndicator={false}
                            >
                                {/* ── Non assigné option ── */}
                                <TouchableOpacity
                                    style={[
                                        styles.memberRow,
                                        styles.noAssigneeRow,
                                        selectedMembers.includes(NO_ASSIGNEE_KEY) && styles.memberRowActive,
                                    ]}
                                    onPress={() => toggleMember(NO_ASSIGNEE_KEY)}
                                >
                                    <Feather
                                        name="user-x"
                                        size={15}
                                        color={selectedMembers.includes(NO_ASSIGNEE_KEY) ? '#2C4F91' : '#8A8A84'}
                                        style={{ marginRight: 10 }}
                                    />
                                    <Text style={[
                                        styles.memberName,
                                        selectedMembers.includes(NO_ASSIGNEE_KEY) && styles.memberNameActive,
                                    ]}>
                                        Non assigné
                                    </Text>
                                    {selectedMembers.includes(NO_ASSIGNEE_KEY) && (
                                        <Feather name="check" size={16} color="#2C4F91" style={{ marginLeft: 'auto' }} />
                                    )}
                                </TouchableOpacity>

                                {filteredMembers.map((member) => {
                                    const isSelected = selectedMembers.includes(member.id);
                                    return (
                                        <TouchableOpacity
                                            key={member.id}
                                            style={[styles.memberRow, isSelected && styles.memberRowActive]}
                                            onPress={() => toggleMember(member.id)}
                                        >
                                            <View style={[styles.avatar, isSelected && styles.avatarActive]}>
                                                <Text style={[styles.avatarText, isSelected && styles.avatarTextActive]}>
                                                    {member.name?.charAt(0).toUpperCase()}
                                                </Text>
                                            </View>
                                            <Text
                                                style={[styles.memberName, isSelected && styles.memberNameActive]}
                                                numberOfLines={1}
                                            >
                                                {member.name}
                                            </Text>
                                            {isSelected && (
                                                <Feather
                                                    name="check"
                                                    size={16}
                                                    color="#2C4F91"
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
    container: {
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    innerContainer: {
        backgroundColor: '#f5f5f4',
        borderWidth: 1,
        borderColor: '#D3D3CE',
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
        color: '#33332F',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
        fontFamily: 'Geist_600SemiBold',
    },

    expandedArea: { gap: 8 },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EDF1F8',
        borderWidth: 1,
        borderColor: '#CDD8EA',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 5,
        maxWidth: 180,
    },
    chipText: {
        fontSize: 11,
        fontFamily: 'Geist_600SemiBold',
        color: '#2C4F91',
        flexShrink: 1,
    },
    pickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EDF1F8',
        borderWidth: 1,
        borderColor: '#CDD8EA',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 6,
    },
    pickerButtonText: {
        fontSize: 12,
        fontFamily: 'Geist_600SemiBold',
        color: '#2C4F91',
    },

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
        fontFamily: 'Geist_700Bold',
        color: '#111',
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8F8F6',
        borderWidth: 1,
        borderColor: '#E4E4E0',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginBottom: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Geist_400Regular',
        color: '#1C1C1A',
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 4,
    },
    noAssigneeRow: {
        borderWidth: 1,
        borderColor: '#E4E4E0',
        borderStyle: 'dashed',
        marginBottom: 8,
    },
    memberRowActive: {
        backgroundColor: '#EDF1F8',
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#E4E4E0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    avatarActive: {
        backgroundColor: '#CDD8EA',
    },
    avatarText: {
        fontSize: 12,
        fontFamily: 'Geist_600SemiBold',
        color: '#5B5B56',
    },
    avatarTextActive: {
        color: '#2C4F91',
    },
    memberName: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Geist_400Regular',
        color: '#33332F',
    },
    memberNameActive: {
        fontFamily: 'Geist_600SemiBold',
        color: '#2C4F91',
    },
    emptyBox: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        fontFamily: 'Geist_400Regular',
        color: '#8A8A84',
    },
    doneButton: {
        marginTop: 12,
        backgroundColor: '#2C4F91',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
    },
    doneButtonText: {
        fontSize: 15,
        fontFamily: 'Geist_700Bold',
        color: '#fff',
    },
});