import { MapPin } from "lucide-react-native"
import { StyleSheet, View } from "react-native"

const Pin = () => {
  return (
    <View style={styles.container}>
      <MapPin size={32} color="#FF3B30" fill="#FF3B30" />
      <View style={styles.shadow} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    marginLeft: -16, 
    marginTop: -32, 
  },
  shadow: {
    position: "absolute",
    bottom: -2,
    width: 10,
    height: 3,
    borderRadius: 5,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
})

export default Pin
