import React, { useEffect, useRef, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

export const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface GMPMapProps {
  mapType: 'search' | 'center' | 'directions';
  mapQuery: string;
  mapCenter: {lat: number, lng: number} | null;
  mapZoom: number | null | undefined;
  directions: {origin: string, destination: string} | null;
  favoritesQuery?: string;
  isLive?: boolean;
  onCameraChange?: (center: {lat: number, lng: number}, zoom: number) => void;
  measureP1?: { lat: number, lng: number } | null;
  measureP2?: { lat: number, lng: number } | null;
  onMapClick?: (coords: { lat: number, lng: number }) => void;
  customPins?: { id: string; lat: number; lng: number; label: string; color: string }[];
  onPinClick?: (pin: { id: string; lat: number; lng: number; label: string; color: string }) => void;
  isTourActive?: boolean;
  isTourPaused?: boolean;
  showSmartItinerary?: boolean;
}

function PlaceSearch({ query, mapType, mapZoom }: { query: string, mapType: string, mapZoom: number | null }) {
  const placesLib = useMapsLibrary('places');
  const map = useMap();
  const [places, setPlaces] = useState<google.maps.places.Place[]>([]);

  useEffect(() => {
    if (!placesLib || !query || !map) return;
    placesLib.Place.searchByText({
      textQuery: query,
      fields: ['displayName', 'location', 'formattedAddress'],
      maxResultCount: 8,
    }).then(({ places }) => {
      setPlaces(places);
      if (places.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        places.forEach(p => p.location && bounds.extend(p.location));
        if (places.length === 1 && mapZoom) {
            map.panTo(places[0].location!);
            map.setZoom(mapZoom);
        } else {
            map.fitBounds(bounds);
        }
      }
    });
  }, [placesLib, query, mapType, mapZoom, map]);

  return (
    <>
      {places.map(p => p.location ? (
        <AdvancedMarker key={p.id} position={p.location} title={p.displayName || ''}>
           <Pin background="#4285F4" glyphColor="#fff" />
        </AdvancedMarker>
      ) : null)}
    </>
  );
}

function RouteDisplay({ origin, destination }: { origin: string; destination: string; }) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination) return;
    polylinesRef.current.forEach(p => p.setMap(null));

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    }).then(({ routes }) => {
      if (routes?.[0]) {
        const newPolylines = routes[0].createPolylines();
        newPolylines.forEach(p => p.setMap(map));
        polylinesRef.current = newPolylines;
        if (routes[0].viewport) map.fitBounds(routes[0].viewport);
      }
    });

    return () => polylinesRef.current.forEach(p => p.setMap(null));
  }, [routesLib, map, origin, destination]);

  return null;
}

function SmartItineraryRoute({ pins }: { pins: { lat: number; lng: number }[] }) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!routesLib || !map || pins.length < 2) {
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      return;
    }

    if (!directionsRendererRef.current) {
        directionsRendererRef.current = new routesLib.DirectionsRenderer({
            map,
            suppressMarkers: true,
            polylineOptions: {
                strokeColor: '#0ea5e9', // teal
                strokeOpacity: 0.8,
                strokeWeight: 5
            }
        });
    } else {
        directionsRendererRef.current.setMap(map);
    }

    const directionsService = new routesLib.DirectionsService();

    const origin = pins[0];
    const destination = pins[pins.length - 1];
    const waypoints = pins.slice(1, -1).map(p => ({ location: p, stopover: true }));

    directionsService.route({
        origin,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.WALKING
    }, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
            directionsRendererRef.current?.setDirections(result);
        } else {
            console.error("Smart Itinerary failed:", status);
        }
    });

    return () => {
        if (directionsRendererRef.current) {
            directionsRendererRef.current.setMap(null);
        }
    };
  }, [routesLib, map, pins]);

  return null;
}

function MapController({ 
  mapCenter, 
  mapZoom,
  isTourActive,
  isTourPaused
}: { 
  mapCenter: {lat: number, lng: number} | null; 
  mapZoom: number | null | undefined;
  isTourActive?: boolean;
  isTourPaused?: boolean;
}) {
    const map = useMap();
    const requestRef = useRef<number>();
    const headingRef = useRef(0);

    useEffect(() => {
        if (!map) return;
        
        const targetTilt = isTourActive ? 60 : 0;
        
        if (mapCenter) {
            const currentCenter = map.getCenter();
            if (!currentCenter || Math.abs(currentCenter.lat() - mapCenter.lat) > 0.0001 || Math.abs(currentCenter.lng() - mapCenter.lng) > 0.0001) {
                headingRef.current = 0;
                map.moveCamera({ center: mapCenter, tilt: targetTilt, heading: headingRef.current });
            } else {
                map.moveCamera({ tilt: targetTilt });
            }
        }
        if (mapZoom !== undefined && mapZoom !== null) {
            const currentZoom = map.getZoom();
            if (currentZoom !== mapZoom) {
                map.setZoom(mapZoom);
            }
        }
    }, [map, mapCenter, mapZoom, isTourActive]);

    // Cinematic 3D Rotation Loop
    useEffect(() => {
        if (!map || !isTourActive || isTourPaused) {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            return;
        }

        const animate = () => {
            headingRef.current = (headingRef.current + 0.1) % 360;
            map.moveCamera({ heading: headingRef.current, tilt: 60 });
            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [map, isTourActive, isTourPaused]);

    return null;
}

function MeasureLine({ p1, p2 }: { p1: { lat: number; lng: number } | null; p2: { lat: number; lng: number } | null }) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (p1 && p2) {
      polylineRef.current = new google.maps.Polyline({
        path: [p1, p2],
        geodesic: true,
        strokeColor: '#0076F0',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map: map
      });
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, p1, p2]);

  return null;
}

export function GMPMap({ mapType, mapQuery, mapCenter, mapZoom, directions, favoritesQuery, isLive, onCameraChange, measureP1, measureP2, onMapClick, customPins = [], onPinClick, isTourActive, isTourPaused, showSmartItinerary }: GMPMapProps) {
  if (!hasValidKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[var(--bg-color)] text-[var(--text-primary)] p-6 overflow-y-auto">
        <div className="text-center max-w-[520px]">
          <h2 className="text-xl font-bold mb-4">Google Maps API Key Required</h2>
          <p className="mb-2 text-sm"><strong>Step 1:</strong> <a className="text-blue-500 hover:underline" href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener">Get an API Key</a></p>
          <p className="mb-2 text-sm"><strong>Step 2:</strong> Add your key as a secret in AI Studio:</p>
          <ul className="text-left leading-relaxed mb-4 list-disc pl-6 text-sm text-[var(--text-secondary)]">
            <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
            <li>Select <strong>Secrets</strong></li>
            <li>Type <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name, press <strong>Enter</strong></li>
            <li>Paste your API key as the value, press <strong>Enter</strong></li>
          </ul>
          <p className="text-xs text-[var(--text-secondary)]">The app rebuilds automatically after you add the secret.</p>
        </div>
      </div>
    );
  }

  const activeQuery = favoritesQuery || (mapType === 'search' ? mapQuery : '');

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <Map
        defaultCenter={mapCenter || { lat: 51.5072, lng: -0.1276 }}
        defaultZoom={mapZoom || 12}
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%', pointerEvents: isLive ? 'none' : 'auto' }}
        gestureHandling="greedy"
        disableDefaultUI={true}
        onCameraChanged={(ev) => {
          if (onCameraChange) {
            const center = ev.detail.center;
            const zoom = ev.detail.zoom;
            onCameraChange({ lat: center.lat, lng: center.lng }, zoom);
          }
        }}
        onClick={(ev) => {
          if (onMapClick && ev.detail.latLng) {
            const lat = typeof ev.detail.latLng.lat === 'function' ? ev.detail.latLng.lat() : ev.detail.latLng.lat;
            const lng = typeof ev.detail.latLng.lng === 'function' ? ev.detail.latLng.lng() : ev.detail.latLng.lng;
            onMapClick({ lat, lng });
          }
        }}
      >
        <MapController mapCenter={mapType === 'center' ? mapCenter : null} mapZoom={mapZoom} isTourActive={isTourActive} isTourPaused={isTourPaused} />
        {showSmartItinerary && customPins && customPins.length >= 2 && (
          <SmartItineraryRoute pins={customPins} />
        )}
        {activeQuery && <PlaceSearch query={activeQuery} mapType={mapType} mapZoom={mapZoom} />}
        {mapType === 'directions' && directions && (
          <RouteDisplay origin={directions.origin} destination={directions.destination} />
        )}
        
        {measureP1 && (
          <AdvancedMarker position={measureP1}>
            <div 
              className="flex items-center justify-center rounded-full bg-[#0076F0] text-white font-bold border-2 border-white shadow-xl text-xs"
              style={{ width: '28px', height: '28px' }}
            >
              A
            </div>
          </AdvancedMarker>
        )}
        {measureP2 && (
          <AdvancedMarker position={measureP2}>
            <div 
              className="flex items-center justify-center rounded-full bg-[#0076F0] text-white font-bold border-2 border-white shadow-xl text-xs"
              style={{ width: '28px', height: '28px' }}
            >
              B
            </div>
          </AdvancedMarker>
        )}
        {customPins && customPins.map((pin) => (
          <AdvancedMarker 
            key={pin.id} 
            position={{ lat: pin.lat, lng: pin.lng }}
            onClick={() => {
              if (onPinClick) onPinClick(pin);
            }}
          >
            <div className="flex flex-col items-center group cursor-pointer">
              <div 
                className="flex items-center justify-center rounded-full shadow-lg border-2 border-white text-white p-2 transition-transform duration-200 hover:scale-110 active:scale-95"
                style={{ backgroundColor: pin.color }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div className="mt-1 bg-white/95 dark:bg-black/95 border border-black/10 dark:border-white/15 px-2.5 py-1 rounded-lg shadow-xl text-[11px] font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap max-w-[140px] truncate transition-all group-hover:shadow-2xl">
                {pin.label}
              </div>
            </div>
          </AdvancedMarker>
        ))}
        <MeasureLine p1={measureP1} p2={measureP2} />
      </Map>
    </APIProvider>
  );
}
