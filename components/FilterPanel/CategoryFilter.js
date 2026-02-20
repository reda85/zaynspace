import { useAtomValue } from 'jotai';
import { useRef, useState } from 'react';
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
import { categoriesAtom } from '../../store/atoms';

export default function CategoryFilter({ active, onToggle, tags, setTags }) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const categories = useAtomValue(categoriesAtom);
  const blurTimeout = useRef(null);

  const suggestions = categories?.map((c) => c.name) || [];

  const addTag = (tag) => {
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
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

  const handleBlur = () => {
    // Delay hiding dropdown slightly to allow item press
    blurTimeout.current = setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  const handleSelect = (item) => {
    // Cancel blur hide if triggered
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    addTag(item);
  };

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Text style={styles.label}>Filtrer par catégorie</Text>
        <Switch value={active} onValueChange={onToggle} circleBorderWidth={0}
        
    renderActiveText={false}
    renderInActiveText={false}
          backgroundActive="#2563eb"
          backgroundInactive="#d1d5db"
          circleActiveColor="#fff"
          circleInActiveColor="#fff" />
      </View>

      {active && (
        <View style={styles.tagInputContainer}>
          <View style={styles.tagList}>
            {tags.map((tag, idx) => (
              <View key={idx} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)}>
                  <Text style={styles.removeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ajouter"
              onFocus={() => setShowDropdown(true)}
              onBlur={handleBlur}
              onSubmitEditing={() => addTag(input.trim())}
              returnKeyType="done"
            />
          </View>

          {showDropdown && filteredSuggestions.length > 0 && (
            <View style={styles.dropdown}>
              <FlatList
                data={filteredSuggestions}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => handleSelect(item)}
                  >
                    <Text>{item}</Text>
                  </TouchableOpacity>
                )}
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
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f3f3f3',
    borderColor: '#ccc',
    borderWidth: 1,
    padding: 8,
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    textTransform: 'capitalize',
    fontFamily: 'Outfit_600SemiBold',
  },
  tagInputContainer: {
    marginTop: 8,
    position: 'relative',
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginRight: 4,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 14,
    marginRight: 6,
  },
  removeText: {
    fontSize: 14,
    color: 'gray',
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 14,
    minWidth: 80,
  },
  dropdown: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 150,
    zIndex: 100,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomColor: '#eee',
    borderBottomWidth: 1,
  },
});
