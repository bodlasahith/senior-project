import { useColorScheme as useRNColorScheme } from 'react-native';

/** RN's ColorSchemeName can be 'unspecified' or null; the app only has light and dark palettes. */
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
