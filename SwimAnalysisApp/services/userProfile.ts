import AsyncStorage from '@react-native-async-storage/async-storage';

/** Used when the user is logged out or hasn't set a weight. */
export const DEFAULT_MASS_KG = 70;

const BODY_MASS_KEY = 'bodyMassKg';

/** Plausible adult swimmer range; anything outside is treated as unset. */
function validMass(value: unknown): number | null {
  const kg = Number(value);
  return Number.isFinite(kg) && kg >= 25 && kg <= 250 ? kg : null;
}

/** Cache the logged-in user's body mass so the Session screen can use it offline. */
export async function saveBodyMassFromUser(user: any): Promise<void> {
  const kg = validMass(user?.profile?.weight);
  if (kg === null) await AsyncStorage.removeItem(BODY_MASS_KEY);
  else await AsyncStorage.setItem(BODY_MASS_KEY, String(kg));
}

export async function clearBodyMass(): Promise<void> {
  await AsyncStorage.removeItem(BODY_MASS_KEY);
}

/** The user's body mass in kg, or DEFAULT_MASS_KG if none is stored. */
export async function getBodyMassKg(): Promise<number> {
  try {
    return validMass(await AsyncStorage.getItem(BODY_MASS_KEY)) ?? DEFAULT_MASS_KG;
  } catch {
    return DEFAULT_MASS_KG;
  }
}
