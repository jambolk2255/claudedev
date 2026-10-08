"use client";

import { APIProvider, AdvancedMarker, Map, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { round, type LatLng } from "./geo";

export default function GoogleMapPicker({
  apiKey,
  value,
  onChange,
  center,
}: {
  apiKey: string;
  value: LatLng | null;
  onChange: (v: LatLng) => void;
  center: LatLng;
}) {
  return (
    <div className="h-56 overflow-hidden rounded-xl border">
      <APIProvider apiKey={apiKey}>
        <Map
          mapId="stockflow-warehouses"
          defaultCenter={value ?? center}
          defaultZoom={value ? 15 : 11}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          onClick={(e: MapMouseEvent) => e.detail.latLng && onChange({ lat: round(e.detail.latLng.lat), lng: round(e.detail.latLng.lng) })}
        >
          {value && (
            <AdvancedMarker position={value} draggable onDragEnd={(e) => e.latLng && onChange({ lat: round(e.latLng.lat()), lng: round(e.latLng.lng()) })} />
          )}
        </Map>
      </APIProvider>
    </div>
  );
}
