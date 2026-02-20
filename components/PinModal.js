import { Button, Image, Modal, StyleSheet, Text, TextInput, View } from 'react-native';

const PinModal = ({ visible, pin, onSave, onCancel, onChangeNote }) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Ajouter un pin</Text>
          <Text>Position: X: {Math.round(pin.x)}, Y: {Math.round(pin.y)}</Text>
          
          {pin.photoUri && (
            <Image 
              source={{ uri: pin.photoUri }} 
              style={styles.previewImage} 
              resizeMode="contain"
            />
          )}
          
          <TextInput
            style={styles.input}
            placeholder="Note pour ce pin"
            value={pin.note}
            onChangeText={onChangeNote}
            multiline
          />
          <View style={styles.modalButtons}>
            <Button title="Annuler" onPress={onCancel} />
            <Button title="Enregistrer" onPress={onSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginVertical: 15,
    minHeight: 80,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 15,
  },
  previewImage: {
    width: 200,
    height: 200,
    marginVertical: 10,
    borderRadius: 5,
  },
});

export default PinModal;