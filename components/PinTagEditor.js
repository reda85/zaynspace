import { Feather } from '@expo/vector-icons';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { selectedProjectAtom } from '../store/atoms';

/**
 * PinTagEditor
 *
 * Props:
 *   pinId        — string | number
 *   initialTags  — Tag[]             tags already on this pin
 *   onChange     — (tags: Tag[]) => void
 */
export default function PinTagEditor({ pinId, initialTags = [], onChange }) {
    const [selectedProject] = useAtom(selectedProjectAtom);
    const insets = useSafeAreaInsets();

    const [pinTags, setPinTags] = useState(initialTags);
    const [allTags, setAllTags] = useState([]);
    const [loadingTags, setLoadingTags] = useState(false);
    const [showSheet, setShowSheet] = useState(false);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [creatingTag, setCreatingTag] = useState(false);
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    // ── Keyboard listeners — push sheet up on Android without KAV ───────────
    useEffect(() => {
        if (!showSheet) return;

        const show = Keyboard.addListener(
            Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
            (e) => setKeyboardOffset(e.endCoordinates.height)
        );
        const hide = Keyboard.addListener(
            Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
            () => setKeyboardOffset(0)
        );

        return () => {
            show.remove();
            hide.remove();
        };
    }, [showSheet]);

    useEffect(() => {
        if (!showSheet) setKeyboardOffset(0);
    }, [showSheet]);

    // Fetch project tags when sheet opens
    useEffect(() => {
        if (!showSheet || !selectedProject?.id) return;
        const fetch = async () => {
            setLoadingTags(true);
            const { data } = await supabase
                .from('tags')
                .select('*')
                .eq('project_id', selectedProject.id)
                .order('order', { ascending: true });
            if (data) setAllTags(data);
            setLoadingTags(false);
        };
        fetch();
    }, [showSheet, selectedProject?.id]);

   useEffect(() => {
    if (initialTags.length > 0 && pinTags.length === 0) {
        console.log('🔄 syncing pinTags from initialTags:', JSON.stringify(initialTags));
        setPinTags(initialTags);
    }
}, [initialTags]);

useEffect(() => {
    console.log('📥 initialTags prop changed:', JSON.stringify(initialTags));
}, [initialTags]);

    const filteredTags = allTags.filter((t) =>
        t.name?.toLowerCase().includes(search.toLowerCase())
    );

    const isSelected = (tagId) => pinTags.some((t) => t.id === tagId);

    const handleToggle = async (tag) => {
        if (saving) return;
        console.log('🔀 toggle tag:', tag.id, tag.name, '| currently selected:', isSelected(tag.id));
        setSaving(true);
        try {
            if (isSelected(tag.id)) {
                await supabase
                    .from('pin_tags')
                    .delete()
                    .eq('pin_id', pinId)
                    .eq('tag_id', tag.id);
                const updated = pinTags.filter((t) => t.id !== tag.id);
                setPinTags(updated);
                onChange?.(updated);
            } else {
                await supabase
                    .from('pin_tags')
                    .insert({ pin_id: pinId, tag_id: tag.id });
                const updated = [...pinTags, tag];
                 console.log('✅ after toggle, pinTags local state:', JSON.stringify(updated));
                setPinTags(updated);
                onChange?.(updated);
            }
        } catch (e) {
            console.error('PinTagEditor toggle error:', e);
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveChip = async (tag) => {
        if (saving) return;
        setSaving(true);
        try {
            await supabase
                .from('pin_tags')
                .delete()
                .eq('pin_id', pinId)
                .eq('tag_id', tag.id);
            const updated = pinTags.filter((t) => t.id !== tag.id);
            setPinTags(updated);
            onChange?.(updated);
        } catch (e) {
            console.error('PinTagEditor remove error:', e);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateTag = async () => {
        if (!search.trim() || creatingTag) return;
        setCreatingTag(true);
        try {
            const { data, error } = await supabase
                .from('tags')
                .insert({
                    project_id: selectedProject.id,
                    name: search.trim(),
                    order: allTags.length,
                    organization_id: selectedProject.organization_id,
                })
                .select()
                .single();
            if (error) throw error;
            setAllTags((prev) => [...prev, data]);
            await supabase.from('pin_tags').insert({ pin_id: pinId, tag_id: data.id });
            const updated = [...pinTags, data];
            setPinTags(updated);
            onChange?.(updated);
            setSearch('');
        } catch (e) {
            console.error('handleCreateTag error:', e);
        } finally {
            setCreatingTag(false);
        }
    };

    return (
        <View style={styles.wrapper}>
            {/* ── Add tag button ── */}
            <TouchableOpacity
                style={styles.addTagButton}
                onPress={() => setShowSheet(true)}
            >
                <View style={styles.iconWrapper}>
                    <Feather name="tag" size={16} color="#333" />
                </View>
                <Text style={styles.addTagButtonText}>
                    {pinTags.length > 0 ? `${pinTags.length} tag(s)` : 'Ajouter tags'}
                </Text>
                {pinTags.length > 0 && (
                    <Feather name="chevron-down" size={16} color="#333" style={{ marginLeft: 'auto' }} />
                )}
            </TouchableOpacity>

            {/* ── Chips row ── */}
            {pinTags.length > 0 && (
                <View style={styles.chipsRow}>
                    {pinTags.map((tag) => (
                        <View key={tag.id} style={styles.chip}>
                            <Feather name="tag" size={10} color="#6D28D9" style={{ marginRight: 3 }} />
                            <Text style={styles.chipText} numberOfLines={1}>{tag.name}</Text>
                            <TouchableOpacity
                                onPress={() => handleRemoveChip(tag)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                disabled={saving}
                            >
                                <Feather name="x" size={10} color="#6D28D9" />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}

            {/* ── Bottom sheet ── */}
            <Modal
                visible={showSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowSheet(false)}
            >
                <View style={styles.modalOverlay}>
                    {/*
                     * marginBottom = keyboard height shifts the sheet up on Android.
                     * Fully self-contained — no KAV, no manifest change, no
                     * interference with the parent screen's keyboard handling.
                     */}
                    <View style={[
                        styles.bottomSheet,
                        {
                            paddingBottom: insets.bottom + 20,
                            marginBottom: keyboardOffset,
                        }
                    ]}>
                        {/* Header */}
                        <View style={styles.sheetHeader}>
                            <Text style={styles.sheetTitle}>Tags</Text>
                            <TouchableOpacity onPress={() => setShowSheet(false)}>
                                <Feather name="x" size={22} color="#333" />
                            </TouchableOpacity>
                        </View>

                        {/* Search */}
                        <View style={styles.searchRow}>
                            <Feather name="search" size={15} color="#9CA3AF" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Rechercher ou créer un tag..."
                                placeholderTextColor="#9CA3AF"
                                value={search}
                                onChangeText={setSearch}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => setSearch('')}>
                                    <Feather name="x-circle" size={15} color="#9CA3AF" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* List */}
                        {loadingTags ? (
                            <View style={styles.emptyBox}>
                                <ActivityIndicator color="#6D28D9" />
                            </View>
                        ) : filteredTags.length === 0 ? (
                            <View style={styles.emptyBox}>
                                <Text style={styles.emptyText}>
                                    {search.trim() ? `Aucun tag trouvé pour "${search.trim()}"` : 'Aucun tag disponible'}
                                </Text>
                                {search.trim().length > 0 && (
                                    <TouchableOpacity
                                        style={styles.createTagButton}
                                        onPress={handleCreateTag}
                                        disabled={creatingTag}
                                    >
                                        {creatingTag ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <>
                                                <Feather name="plus" size={14} color="#fff" />
                                                <Text style={styles.createTagButtonText}>
                                                    Créer "{search.trim()}"
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            <ScrollView
                                contentContainerStyle={{ paddingBottom: 16 }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                {/* Create button at top when no exact match */}
                                {search.trim().length > 0 &&
                                    !allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase()) && (
                                    <TouchableOpacity
                                        style={styles.createTagInlineButton}
                                        onPress={handleCreateTag}
                                        disabled={creatingTag}
                                    >
                                        {creatingTag ? (
                                            <ActivityIndicator size="small" color="#6D28D9" />
                                        ) : (
                                            <>
                                                <View style={[styles.tagBadge, styles.tagBadgeCreate]}>
                                                    <Feather name="plus" size={13} color="#6D28D9" />
                                                </View>
                                                <Text style={styles.createTagInlineText}>
                                                    Créer "{search.trim()}"
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}

                                {filteredTags.map((tag) => {
                                    const selected = isSelected(tag.id);
                                    return (
                                        <TouchableOpacity
                                            key={tag.id}
                                            style={[styles.tagRow, selected && styles.tagRowActive]}
                                            onPress={() => handleToggle(tag)}
                                            disabled={saving}
                                        >
                                            <View style={[styles.tagBadge, selected && styles.tagBadgeActive]}>
                                                <Feather
                                                    name="tag"
                                                    size={13}
                                                    color={selected ? '#6D28D9' : '#9CA3AF'}
                                                />
                                            </View>
                                            <Text style={[styles.tagName, selected && styles.tagNameActive]}>
                                                {tag.name}
                                            </Text>
                                            {selected && (
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

                        {/* Done */}
                        <TouchableOpacity
                            style={styles.doneButton}
                            onPress={() => setShowSheet(false)}
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
    wrapper: {
        marginTop: 10,
        gap: 8,
    },

    // ── Add tag button ───────────────────────────────────────────────────────
    addTagButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 9999,
        alignSelf: 'flex-start',
    },
    iconWrapper: {
        backgroundColor: 'white',
        borderRadius: 9999,
        padding: 6,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    addTagButtonText: {
        color: '#333',
        fontFamily: 'Outfit_400Regular',
        fontSize: 14,
    },

    // ── Chips ────────────────────────────────────────────────────────────────
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
        gap: 3,
        maxWidth: 160,
    },
    chipText: {
        fontSize: 11,
        fontFamily: 'Outfit_600SemiBold',
        color: '#6D28D9',
        flexShrink: 1,
    },

    // ── Bottom sheet ─────────────────────────────────────────────────────────
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
        marginBottom: 14,
    },
    sheetTitle: {
        fontSize: 18,
        fontFamily: 'Outfit_600SemiBold',
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
        marginHorizontal: 20,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        fontFamily: 'Outfit_400Regular',
        color: '#111827',
    },

    // ── Tag rows ─────────────────────────────────────────────────────────────
    tagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
    },
    tagRowActive: {
        backgroundColor: '#EDE9FE',
    },
    tagBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    tagBadgeActive: {
        backgroundColor: '#DDD6FE',
    },
    tagBadgeCreate: {
        backgroundColor: '#EDE9FE',
    },
    tagName: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Outfit_400Regular',
        color: '#333',
    },
    tagNameActive: {
        fontFamily: 'Outfit_600SemiBold',
        color: '#6D28D9',
    },

    // ── Create tag — inline ──────────────────────────────────────────────────
    createTagInlineButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        marginBottom: 4,
    },
    createTagInlineText: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Outfit_600SemiBold',
        color: '#6D28D9',
    },

    // ── Create tag — centered (no results) ───────────────────────────────────
    emptyBox: {
        paddingVertical: 32,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 13,
        fontFamily: 'Outfit_400Regular',
        color: '#9CA3AF',
        textAlign: 'center',
    },
    createTagButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#6D28D9',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        minWidth: 80,
        justifyContent: 'center',
    },
    createTagButtonText: {
        color: '#fff',
        fontSize: 13,
        fontFamily: 'Outfit_600SemiBold',
    },

    // ── Done button ──────────────────────────────────────────────────────────
    doneButton: {
        marginTop: 12,
        marginHorizontal: 20,
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