import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Switch } from 'react-native-switch';

const DATE_OPTIONS = [
    { key: "Aujourd'hui", label: "Aujourd'hui", icon: 'sun' },
    { key: 'Cette semaine', label: 'Cette semaine', icon: 'calendar' },
    { key: 'Ce mois-ci', label: 'Ce mois-ci', icon: 'layers' },
];

export default function DateFilter({ active, onToggle, tags, setTags }) {
    const toggleTag = (tag) => {
        setTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.innerContainer}>
                {/* Toggle row — matches StatusFilter */}
                <View style={styles.row}>
                    <Text style={styles.label}>Filtrer par date</Text>
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

                {/* Quick-select pills (shown when active) */}
                {active && (
                    <View style={styles.pillsRow}>
                        {DATE_OPTIONS.map((option) => {
                            const isSelected = tags.includes(option.key);
                            return (
                                <TouchableOpacity
                                    key={option.key}
                                    style={[styles.pill, isSelected && styles.pillSelected]}
                                    onPress={() => toggleTag(option.key)}
                                    activeOpacity={0.75}
                                >
                                    <Feather
                                        name={option.icon}
                                        size={13}
                                        color={isSelected ? '#fff' : '#6B7280'}
                                    />
                                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                                        {option.label}
                                    </Text>
                                    {isSelected && (
                                        <Feather name="check" size={12} color="#fff" style={{ marginLeft: 2 }} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>
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

    // ── Pills ────────────────────────────────────────────────────────────────
    pillsRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    pillSelected: {
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
    },
    pillText: {
        fontSize: 12,
        fontFamily: 'Outfit_600SemiBold',
        color: '#374151',
    },
    pillTextSelected: {
        color: '#fff',
    },
});