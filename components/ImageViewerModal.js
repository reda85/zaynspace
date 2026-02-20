import { X } from 'lucide-react-native';
import {
  Dimensions,
  Image,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// Avatar component (same as Timeline)
const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.split(' ').filter(part => part.length > 0);
  if (parts.length === 0) return '??';

  const firstInitial = parts[0][0].toUpperCase();
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
  
  return `${firstInitial}${lastInitial}`;
};

const Avatar = ({ name }) => {
  const initials = getInitials(name);
  const hash = initials.charCodeAt(0) + initials.charCodeAt(initials.length - 1);
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688'];
  const colorIndex = hash % colors.length;

  return (
    <View style={[styles.avatarContainer, { backgroundColor: colors[colorIndex] }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
};

export default function ImageViewerModal({ visible, onClose, imageUrl, userName, description }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <View style={styles.container}>
        {/* Close Button */}
        <TouchableOpacity 
          style={[styles.closeButton, { top: insets.top + 16 }]} 
          onPress={onClose}
        >
          <View style={styles.closeButtonCircle}>
            <X size={24} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Full-screen Image */}
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: imageUrl }} 
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/* Bottom Info Panel */}
        <View style={[styles.infoPanel, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.userInfo}>
            <Avatar name={userName} />
            <Text style={styles.userName}>{userName}</Text>
          </View>
          
          {description ? (
            <View style={styles.descriptionContainer}>
              <Text style={styles.description}>{description}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height * 0.7,
  },
  infoPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingTop: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
  },
  userName: {
    fontSize: 18,
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
  },
  descriptionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Outfit_400Regular',
    color: '#fff',
    lineHeight: 22,
  },
});