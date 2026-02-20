import {
    CheckIcon,
    DoorClosedIcon,
    DropletsIcon,
    FireExtinguisherIcon,
    GripIcon,
    PaintRoller,
    SnowflakeIcon,
    ZapIcon
} from 'lucide-react-native';

export const categoriesIcons = {
  'unassigned': <CheckIcon className="text-white h-4 w-4" />,
  'zap': <ZapIcon className="text-white h-4 w-4" />,
  'droplets': <DropletsIcon className="text-white h-4 w-4" />,
  'paint': <PaintRoller className="text-white h-4 w-4" />,
  'carrelage': <GripIcon className="text-white h-4 w-4" />,
  'fire-extinguisher': <FireExtinguisherIcon className="text-white h-4 w-4" />,
  'doors': <DoorClosedIcon className="text-white h-4 w-4" />,
  'snowflake': <SnowflakeIcon className="text-white h-4 w-4" />,
};
