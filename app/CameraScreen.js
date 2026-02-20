import CameraModal from "../components/CameraView";


export default function CameraScreen({ params }) {
  // params come from navigation: pinId, etc.
  return <CameraModal {...params} />;
}
