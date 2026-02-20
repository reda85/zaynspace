import { StyleSheet, Text, View } from 'react-native';

const SyncStatusBar = ({ pdfName, syncStatus }) => {
  return (
    <View style={styles.statusBar}>
      <Text style={styles.pdfName}>{pdfName || 'Aucun PDF sélectionné'}</Text>
      <Text style={styles.syncStatus}>{syncStatus || 'Chargement...'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  pdfName: {
    fontWeight: 'bold',
    flex: 1,
  },
  syncStatus: {
    fontStyle: 'italic',
    color: '#666',
  },
});

export default SyncStatusBar;