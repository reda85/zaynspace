import dayjs from 'dayjs';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ImageViewerModal from './ImageViewerModal';

// Fonction utilitaire pour obtenir les initiales
const getInitials = (name) => {
  if (!name) return '??';
  const parts = name.split(' ').filter(part => part.length > 0);
  if (parts.length === 0) return '??';

  const firstInitial = parts[0][0].toUpperCase();
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
  
  return `${firstInitial}${lastInitial}`;
};

// Composant Avatar pour afficher les initiales
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
}

export default function Timeline({ events = [], comments = [], showAllEvents = true }) {
    const [selectedImage, setSelectedImage] = useState(null);
    
    // Combine and sort events and comments by date (ascending - oldest first)
    const combinedItems = [
        ...events.map(e => ({ ...e, type: 'event' })),
        ...comments.map(c => ({ ...c, type: 'comment' }))
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const displayedItems = showAllEvents ? combinedItems : combinedItems.slice(0, 20);
    
    const handleImagePress = (photo, userName) => {
        setSelectedImage({
            imageUrl: photo.public_url,
            userName: userName,
            description: photo.description || '',
        });
    };

    const handleCloseModal = () => {
        setSelectedImage(null);
    };
    
    return (
        <View style={styles.list}>
            {displayedItems.length === 0 ? (
                <Text style={styles.noUpdateText}>Aucune mise à jour</Text>
            ) : (
                displayedItems.map((item) => {
                    const timestamp = dayjs(item.created_at).format('MMM D, YYYY h:mm A');
                    const userName = item?.members?.name || 'Utilisateur inconnu';
                    const isComment = item.type === 'comment';

                    return (
                        <View key={`${item.type}-${item.id}`} style={styles.item}>
                            <View style={styles.header}>
                                <Avatar name={userName} /> 
                                
                                <View style={styles.textStack}>
                                    <View style={styles.titleStack}>
                                        <Text style={styles.user}>{userName}</Text>
                                        <Text style={styles.title}>
                                            {isComment ? 'a commenté' : (item.category !== 'photo_upload' ? item.event : 'a ajouté une photo')}
                                        </Text>
                                    </View>
                                    <Text style={styles.timestamp}>{timestamp}</Text>
                                </View>
                            </View>
                            
                            {/* Display comment text */}
                            {isComment && item.comment && (
                                <View style={styles.commentBox}>
                                    <Text style={styles.commentText}>{item.comment}</Text>
                                </View>
                            )}

                            {/* Display photo for events */}
                            {!isComment && item.pins_photos?.public_url && (
                                <TouchableOpacity 
                                    style={styles.imageWrapper}
                                    onPress={() => handleImagePress(item.pins_photos, userName)}
                                    activeOpacity={0.9}
                                >
                                    <Image
                                        source={{ uri: item.pins_photos.public_url }}
                                        style={styles.image}
                                        resizeMode="cover"
                                    />
                                    {item.pins_photos.description ? (
                                        <View style={styles.overlay}>
                                            <Text style={styles.overlayText} numberOfLines={2}>
                                                {item.pins_photos.description}
                                            </Text>
                                        </View>
                                    ) : null}
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })
            )}

            {/* Image Viewer Modal */}
            {selectedImage && (
                <ImageViewerModal
                    visible={!!selectedImage}
                    onClose={handleCloseModal}
                    imageUrl={selectedImage.imageUrl}
                    userName={selectedImage.userName}
                    description={selectedImage.description}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    list: { 
        backgroundColor: '#f9f9f9', 
        borderTopWidth: 1, 
        borderTopColor: '#eee', 
        marginHorizontal: -20,
        paddingTop: 10,
    },
    
    noUpdateText: { 
        paddingHorizontal: 20, 
        color: '#666', 
        paddingBottom: 20 
    },

    item: {
        marginBottom: 16,
        paddingHorizontal: 20, 
        overflow: 'hidden',
    },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 0 },
    
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
    
    textStack: { flex: 1 },
    titleStack: { flexDirection: 'row', flex: 1, alignItems: 'baseline' },
    user: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#333', marginRight: 5 },
    title: { 
        fontSize: 16, 
        fontFamily: 'Outfit_400Regular', 
        color: '#333', 
        flexShrink: 1 
    },
    timestamp: { fontSize: 12, fontFamily: 'Outfit_400Regular', color: '#666', marginTop: 1 },
    
    commentBox: {
        backgroundColor: '#F3F4F6',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    commentText: {
        fontSize: 14,
        fontFamily: 'Outfit_400Regular',
        color: '#374151',
        lineHeight: 20,
    },
    
    imageWrapper: {
        position: 'relative',
        width: '100%',
        height: 300,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#eee',
        marginTop: 8, 
    },
    image: {
        width: '100%',
        height: '100%',
    },
    overlay: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    overlayText: {
        color: '#fff',
        fontSize: 14,
        fontFamily: 'Outfit_400Regular',
    },
});