"use client";

import { APIProvider, AdvancedMarker, InfoWindow, Map, Pin } from "@vis.gl/react-google-maps";
import { useState } from "react";
import type { MapPoint } from "./maps-page";

const COLORS = { warehouse: "#6d5bd0", customer: "#16a34a", supplier: "#ea580c" } as const;

export default function OverviewMap({ apiKey, points, openLabel }: { apiKey: string; points: MapPoint[]; openLabel: string }) {
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const center = points.length
    ? { lat: points.reduce((s, p) => s + p.lat, 0) / points.length, lng: points.reduce((s, p) => s + p.lng, 0) / points.length }
    : { lat: 7.8731, lng: 80.7718 };
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId="stockflow-overview"
        defaultCenter={center}
        defaultZoom={points.length ? 9 : 7}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        className="h-full w-full"
      >
        {points.map((p) => (
          <AdvancedMarker key={`${p.kind}-${p.id}`} position={p} title={p.name} onClick={() => setSelected(p)}>
            <Pin background={COLORS[p.kind]} borderColor="#fff" glyphColor="#fff" />
          </AdvancedMarker>
        ))}
        {selected && (
          <InfoWindow position={selected} onCloseClick={() => setSelected(null)} headerContent={<strong>{selected.name}</strong>}>
            <div style={{ fontSize: 12, color: "#333" }}>
              {selected.detail && <p>{selected.detail}</p>}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: COLORS[selected.kind] }}
              >
                {openLabel}
              </a>
            </div>
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  );
}
