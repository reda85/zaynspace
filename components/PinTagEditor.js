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
            {/* Tags du pin (pastilles grises) puis le bouton d'ajout, sur une ligne */}
            <View style={styles.chipsRow}>
                {pinTags.map((tag) => (
                    <View key={tag.id} style={styles.chip}>
                        <Text style={styles.chipText} numberOfLines={1}>{tag.name}</Text>
                        <TouchableOpacity
                            onPress={() => handleRemoveChip(tag)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            disabled={saving}
                            accessibilityLabel={`Retirer le tag ${tag.name}`}
                        >
                            <Feather name="x" size={11} color="#5B5B56" />
                        </TouchableOpacity>
                    </View>
                ))}
                <TouchableOpacity style={styles.addTagButton} onPress={() => setShowSheet(true)}>
                    <Text style={styles.addTagButtonText}>{pinTags.length > 0 ? '+ Tag' : '+ Ajouter des tags'}</Text>
                </TouchableOpacity>
            </View>

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
                            <Feather name="search" size={15} color="#8A8A84" style={{ marginRight: 8 }} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Rechercher ou créer un tag..."
                                placeholderTextColor="#8A8A84"
                                value={search}
                                onChangeText={setSearch}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => setSearch('')}>
                                    <Feather name="x-circle" size={15} color="#8A8A84" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* List */}
                        {loadingTags ? (
                            <View style={styles.emptyBox}>
                                <ActivityIndicator color="#2C4F91" />
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
                                            <ActivityIndicator size="small" color="#2C4F91" />
                                        ) : (
                                            <>
                                                <View style={[styles.tagBadge, styles.tagBadgeCreate]}>
                                                    <Feather name="plus" size={13} color="#2C4F91" />
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
                                                    color={selected ? '#2C4F91' : '#8A8A84'}
                                                />
                                            </View>
                                            <Text style={[styles.tagName, selected && styles.tagNameActive]}>
                                                {tag.name}
                                            </Text>
                                            {selected && (
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

    // ── Bouton d'ajout et pastilles ─────────────────────────────────────────
    addTagButton: {
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#D3D3CE',
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
    },
    addTagButtonText: {
        color: '#5B5B56',
        fontFamily: 'Outfit_500Medium',
        fontSize: 12,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEEEEB',
        borderRadius: 14,
        height: 28,
        paddingLeft: 10,
        paddingRight: 8,
        gap: 6,
        maxWidth: 180,
    },
    chipText: {
        fontSize: 12,
        fontFamily: 'Outfit_500Medium',
        color: '#1C1C1A',
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
        backgroundColor: '#F8F8F6',
        borderWidth: 1,
        borderColor: '#E4E4E0',
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
        color: '#1C1C1A',
    },

    // ── Tag rows ─────────────────────────────────────────────────────────────
    tagRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
    },
    tagRowActive: {
        backgroundColor: '#EDF1F8',
    },
    tagBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F3F0',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    tagBadgeActive: {
        backgroundColor: '#CDD8EA',
    },
    tagBadgeCreate: {
        backgroundColor: '#EDF1F8',
    },
    tagName: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Outfit_400Regular',
        color: '#333',
    },
    tagNameActive: {
        fontFamily: 'Outfit_600SemiBold',
        color: '#2C4F91',
    },

    // ── Create tag — inline ──────────────────────────────────────────────────
    createTagInlineButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F3F0',
        marginBottom: 4,
    },
    createTagInlineText: {
        flex: 1,
        fontSize: 16,
        fontFamily: 'Outfit_600SemiBold',
        color: '#2C4F91',
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
        color: '#8A8A84',
        textAlign: 'center',
    },
    createTagButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2C4F91',
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
        backgroundColor: '#2C4F91',
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