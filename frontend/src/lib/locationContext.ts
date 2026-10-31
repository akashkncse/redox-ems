export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type SolarForecastItem = {
  time: string;
  radiation: number;
};

export type LocationContext = {
  placeName: string;
  coordinates: LocationCoordinates;
  solarForecast: SolarForecastItem[];
};

export const DEFAULT_LOCATION_CONTEXT: LocationContext = {
  placeName: 'Perundurai, Tamil Nadu',
  coordinates: { latitude: 11.2756, longitude: 77.5870 },
  solarForecast: [],
};

const LOCATION_CONTEXT_KEY = 'redox-ems-location-context';

export function loadLocationContext(): LocationContext {
  try {
    const stored = localStorage.getItem(LOCATION_CONTEXT_KEY);
    if (!stored) return DEFAULT_LOCATION_CONTEXT;

    const context = JSON.parse(stored) as LocationContext;
    if (
      typeof context.placeName === 'string' &&
      typeof context.coordinates?.latitude === 'number' &&
      typeof context.coordinates?.longitude === 'number' &&
      Array.isArray(context.solarForecast)
    ) {
      return context;
    }
  } catch {
    // Use the default context when browser storage is unavailable or invalid.
  }

  return DEFAULT_LOCATION_CONTEXT;
}

export function saveLocationContext(context: LocationContext): void {
  localStorage.setItem(LOCATION_CONTEXT_KEY, JSON.stringify(context));
}
