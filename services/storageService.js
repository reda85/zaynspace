import AsyncStorage from '@react-native-async-storage/async-storage';

export const savePinsToStorage = async (pdfName, pins) => {
  try {
    console.log('Sauvegarde des pins:', pins);
    await AsyncStorage.setItem(`pins_${pdfName}`, JSON.stringify(pins));
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde locale des pins:', error);
    throw error;
  }
};

export const loadPinsFromStorage = async (pdfName) => {
  try {
    const storedPins = await AsyncStorage.getItem(`pins_${pdfName}`);
   
    if (storedPins) {
      return JSON.parse(storedPins);
    }
    return null;
  } catch (error) {
    console.error('Erreur lors du chargement des pins:', error);
    throw error;
  }
};