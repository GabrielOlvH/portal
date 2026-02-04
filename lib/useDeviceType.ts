import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 600;

export function useDeviceType() {
  const { width, height } = useWindowDimensions();
  const minDimension = Math.min(width, height);
  const isTablet = minDimension >= TABLET_BREAKPOINT;

  return {
    isTablet,
    isPhone: !isTablet,
    screenWidth: width,
    screenHeight: height,
  };
}
