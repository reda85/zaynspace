import * as FileSystem from 'expo-file-system';
import { Image, Modal, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PinDetailsModal = ({ visible, pin, onClose, onDelete }) => {
  if (!pin) return null;
  
  const sharePin = async () => {
    try {
      let shareOptions = {
        message: `Note: ${pin.note || 'Aucune note'}`,
      };
      
    
      if (pin.photoUri) {
     
        const fileInfo = await FileSystem.getInfoAsync(pin.photoUri);
        if (fileInfo.exists) {
          shareOptions.url = pin.photoUri;
        }
      }
      
      await Share.share(shareOptions);
    } catch (error) {
      console.error('Erreur lors du partage:', error);
    }
  };
  
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Détails du pin</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
            {pin.photoUri ? (
              <View style={styles.imageContainer}>
                <Image 
                  source={{ uri: pin.photoUri }} 
                  style={styles.detailsImage} 
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={styles.noImageContainer}>
                <Text style={styles.noImageText}>Aucune image</Text>
              </View>
            )}
            
            <View style={styles.noteContainer}>
              <Text style={styles.noteLabel}>Note:</Text>
              <Text style={styles.noteText}>{pin.note || "Aucune note"}</Text>
            </View>
            
            <View style={styles.positionContainer}>
              <Text style={styles.positionLabel}>Position:</Text>
              <Text style={styles.positionText}>X: {Math.round(pin.x)}, Y: {Math.round(pin.y)}</Text>
            </View>
          </ScrollView>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.actionButton} onPress={sharePin}>
              <Text style={styles.actionButtonText}>Partager</Text>
            </TouchableOpacity>
            
            {onDelete && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteButton]} 
                onPress={() => onDelete(pin)}
              >
                <Text style={styles.actionButtonText}>Supprimer</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.closeModalButton} onPress={onClose}>
              <Text style={styles.closeModalButtonText}>Fermer</Text>
            </TouchableOpacity>
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
    padding: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#999',
  },
  scrollView: {
    width: '100%',
    maxHeight: '70%',
  },
  scrollViewContent: {
    padding: 15,
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 15,
  },
  detailsImage: {
    width: 250,
    height: 250,
    borderRadius: 5,
    backgroundColor: '#f9f9f9',
  },
  noImageContainer: {
    width: 250,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    marginBottom: 15,
  },
  noImageText: {
    color: '#999',
    fontStyle: 'italic',
  },
  noteContainer: {
    width: '100%',
    marginBottom: 15,
  },
  noteLabel: {
    fontWeight: 'bold',
    marginBottom: 5,
    fontSize: 16,
  },
  noteText: {
    fontSize: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
    padding: 10,
    minHeight: 50,
  },
  positionContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  positionLabel: {
    fontWeight: 'bold',
    marginRight: 5,
  },
  positionText: {
    color: '#666',
  },
  buttonContainer: {
    flexDirection: 'column',
    width: '100%',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  closeModalButton: {
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  closeModalButtonText: {
    color: '#666',
    fontSize: 16,
  },
});

export default PinDetailsModal;