import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Location.css';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Weather = {
  temperature: number;
  windspeed: number;
  weathercode: number;
  time: string;
};

type SolarForecast = {
  time: string;
  radiation: number;
}[];

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

const DEFAULT_LOCATION: Coordinates = { latitude: 11.2756, longitude: 77.5870 };

const weatherLabels: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

function formatHour(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric' });
}

export default function Location() {
  const [coordinates, setCoordinates] = useState(DEFAULT_LOCATION);
  const [placeName, setPlaceName] = useState('Perundurai, Tamil Nadu');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [solarForecast, setSolarForecast] = useState<SolarForecast>([]);
  const [error, setError] = useState('');
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const mapUrl = useMemo(
    () => `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=14/${coordinates.latitude}/${coordinates.longitude}`,
    [coordinates],
  );

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;

    const map = L.map(mapElement.current).setView(
      [DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude],
      13,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude], {
      draggable: true,
    }).addTo(map);
    marker.bindTooltip('Selected location');
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      setCoordinates({ latitude: position.lat, longitude: position.lng });
      setPlaceName('Selected map location');
    });
    map.on('click', (event) => {
      marker.setLatLng(event.latlng);
      setCoordinates({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      setPlaceName('Selected map location');
    });

    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setView([coordinates.latitude, coordinates.longitude], 13);
    markerRef.current?.setLatLng([coordinates.latitude, coordinates.longitude]);
  }, [coordinates]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: search,
        format: 'jsonv2',
        limit: '5',
      });
      fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then((response) => {
          if (!response.ok) throw new Error('Location search failed');
          return response.json() as Promise<SearchResult[]>;
        })
        .then(setSearchResults)
        .catch((reason: Error) => {
          if (reason.name !== 'AbortError') setError(reason.message);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      latitude: coordinates.latitude.toString(),
      longitude: coordinates.longitude.toString(),
      current: 'temperature_2m,wind_speed_10m,weather_code',
      hourly: 'shortwave_radiation',
      forecast_days: '1',
      timezone: 'auto',
    });

    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Weather service unavailable');
        return response.json() as Promise<{
          current: { temperature_2m: number; wind_speed_10m: number; weather_code: number; time: string };
          hourly: { time: string[]; shortwave_radiation: number[] };
        }>;
      })
      .then((data) => {
        setWeather({
          temperature: data.current.temperature_2m,
          windspeed: data.current.wind_speed_10m,
          weathercode: data.current.weather_code,
          time: data.current.time,
        });
        setSolarForecast(data.hourly.time.map((time, index) => ({
          time,
          radiation: data.hourly.shortwave_radiation[index] ?? 0,
        })).filter((item) => item.radiation > 0).slice(0, 6));
        setError('');
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });

    return () => controller.abort();
  }, [coordinates]);

  const selectSearchResult = (result: SearchResult) => {
    const next = { latitude: Number(result.lat), longitude: Number(result.lon) };
    setCoordinates(next);
    setPlaceName(result.display_name);
    setSearch(result.display_name);
    setSearchResults([]);
  };

  return (
    <div className="location-page">
      <header className="location-header">
        <div>
          <div className="location-eyebrow">Site context</div>
          <h1>Location</h1>
        </div>
        <span className="location-badge">OpenStreetMap + Open-Meteo</span>
      </header>

      <div className="location-search">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search for a city or site..."
          aria-label="Search location"
        />
        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((result) => (
              <button type="button" key={`${result.lat}-${result.lon}`} onClick={() => selectSearchResult(result)}>
                {result.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="location-notice">{error}</div>}

      <div className="location-grid">
        <section className="map-card">
          <div className="section-heading">
            <div>
              <h2>{placeName}</h2>
              <p>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)} · click or drag marker to move</p>
            </div>
            <a href={mapUrl} target="_blank" rel="noreferrer">Open full map</a>
          </div>
          <div ref={mapElement} className="location-map" />
        </section>

        <section className="weather-card">
          <div className="section-heading">
            <div>
              <h2>Weather & solar forecast</h2>
              <p>Powered by Open-Meteo</p>
            </div>
          </div>
          {weather ? (
            <>
              <div className="temperature">{weather.temperature.toFixed(1)}°C</div>
              <div className="weather-description">{weatherLabels[weather.weathercode] ?? 'Current conditions'}</div>
              <div className="weather-stat"><span>Wind</span><strong>{weather.windspeed.toFixed(1)} km/h</strong></div>
              <div className="solar-heading">Predicted solar production</div>
              {solarForecast.length === 0 ? (
                <p className="weather-message">No daylight production predicted today.</p>
              ) : (
                <div className="solar-list">
                  {solarForecast.map((item) => (
                    <div className="solar-row" key={item.time}>
                      <span>{formatHour(item.time)}</span>
                      <div className="solar-bar"><i style={{ width: `${Math.min(100, item.radiation / 10)}%` }} /></div>
                      <strong>{Math.round(item.radiation)} W/m²</strong>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="weather-message">Loading weather and solar forecast...</p>
          )}
        </section>
      </div>
    </div>
  );
}
