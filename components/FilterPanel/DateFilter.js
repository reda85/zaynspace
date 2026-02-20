import { useState } from 'react';
import {
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Switch } from 'react-native-switch';

const suggestions = ['Aujourd’hui', 'Cette semaine', 'Ce mois-ci'];

export default function DateFilter({ active, onToggle, tags, setTags }) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const addTag = (tag) => {
    if (!tags.includes(tag)) setTags([...tags, tag]);
    setInput('');
    setShowDropdown(false);
    Keyboard.dismiss();
  };

  const removeTag = (tag) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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

      {active && (
        <View style={styles.tagsSection}>
          <View style={styles.tagsRow}>
            {tags.map((tag, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)}>
                  <Text style={styles.removeTag}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TextInput
              style={styles.input}
              placeholder="Ajouter"
              value={input}
              onChangeText={setInput}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onSubmitEditing={() => addTag(input.trim())}
              returnKeyType="done"
            />
          </View>

          {showDropdown && filteredSuggestions.length > 0 && (
            <View style={styles.dropdown}>
              <FlatList
                data={filteredSuggestions}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => addTag(item)}
                  >
                    <Text>{item}</Text>
                  </TouchableOpacity>
                )}
                keyboardShouldPersistTaps="handled"
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f4',
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
    fontFamily: 'Outfit_600SemiBold',
  },
  tagsSection: {
    marginTop: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 8,
    marginRight: 8,
  },
  tagText: {
    fontSize: 14,
    marginRight: 4,
  },
  removeTag: {
    fontSize: 14,
    color: '#6b7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 14,
    minWidth: 80,
  },
  dropdown: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    maxHeight: 160,
    zIndex: 10,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
});
