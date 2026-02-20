import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
export default function PhotoMetadataModalMulti({ visible, photos, onCancel, onSave }) {
  const [index, setIndex] = useState(0);
  const [meta, setMeta] = useState([]);

  useEffect(() => {
    if (visible) {
      setIndex(0);
      setMeta(photos.map(() => ({ description: "", tag: "" })));
    }
  }, [visible, photos]);

  if (!visible || !photos?.length) return null;

  const update = (field, val) => {
    const next = [...meta];
    next[index][field] = val;
    setMeta(next);
  };

  const nextOrSave = () => {
    if (index < photos.length - 1) setIndex(index + 1);
    else {
      // Merge metadata with photo objects
      const merged = photos.map((photoObj, i) => ({ ...photoObj, ...meta[i] }));
      onSave(merged);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel} style={s.iconBtn}>
            <Feather name="x" size={22} />
          </TouchableOpacity>
          <Text style={s.headerText}>{`Photo ${index + 1} / ${photos.length}`}</Text>
          <View style={{ width: 40 }} />
        </View>

        <Image source={{ uri: photos[index].uri }} style={s.image} />

        <View style={s.form}>
          <Text style={s.label}>Description</Text>
          <TextInput
            value={meta[index]?.description}
            onChangeText={(v) => update("description", v)}
            placeholder="Ajouter une description…"
            style={s.input}
          />
          <Text style={s.label}>Tag</Text>
          <TextInput
            value={meta[index]?.tag}
            onChangeText={(v) => update("tag", v)}
            placeholder="Tag (ex: électricité, peinture)"
            style={s.input}
          />
        </View>

        <TouchableOpacity onPress={nextOrSave} style={s.cta}>
          <Text style={s.ctaText}>{index === photos.length - 1 ? "Enregistrer" : "Suivant"}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
