import { useLocalSearchParams } from "expo-router";
import DrawingScreen from "../components/DrawingScreen";

// L'écran est réutilisé par la navigation quand on revient prendre des photos.
// Or son état dépend du nombre de photos reçues (un chargement d'image par
// photo) : avec un autre lot, l'état se décale et l'écran plante
// (« Cannot read property 'width' of undefined »). La clé force un écran neuf
// à chaque nouveau lot : dessins, descriptions et suivi d'envoi repartent de zéro.
export default function DrawingScreenRoute() {
  const { photos } = useLocalSearchParams();
  const key = typeof photos === "string" ? photos : JSON.stringify(photos ?? null);
  return <DrawingScreen key={key} />;
}
