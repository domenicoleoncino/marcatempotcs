// File: src/components/MappaPresenze.js
import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix per le icone standard di Leaflet che a volte spariscono in React
import iconMarker from 'leaflet/dist/images/marker-icon.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Sovrascriviamo le opzioni di default delle icone
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: iconMarker,
  shadowUrl: iconShadow,
});

// --- COMPONENTE INTERNO PER AUTO-ZOOM ---
const AutoZoom = ({ aree }) => {
  const map = useMap();

  useEffect(() => {
    if (!aree || aree.length === 0) return;

    // Filtra solo le aree con coordinate valide (diverse da 0,0 e non nulle)
    const areeValide = aree.filter(a => 
      a.latitude && a.longitude && (a.latitude !== 0 || a.longitude !== 0)
    );

    if (areeValide.length > 0) {
      // Crea un oggetto bounds che contiene tutte le coordinate
      const bounds = L.latLngBounds(areeValide.map(a => [a.latitude, a.longitude]));
      
      // Adatta la mappa a questi confini con un padding (margine) di 50px
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [aree, map]);

  return null;
};

const MappaPresenze = ({ aree, presenzeAttive }) => {

  // 1. Calcoliamo quanti dipendenti ci sono per ogni Area
  const conteggi = useMemo(() => {
    const counts = {};
    
    // Inizializza tutto a 0
    if(aree) aree.forEach(a => counts[a.id] = 0);

    // Conta le presenze basandosi sull'array activeEmployeesDetails
    if (presenzeAttive && Array.isArray(presenzeAttive)) {
      presenzeAttive.forEach(presenza => {
        const areaId = presenza.workAreaId;
        if (areaId) {
          counts[areaId] = (counts[areaId] || 0) + 1;
        }
      });
    }
    return counts;
  }, [aree, presenzeAttive]);

  // 2. Funzione per creare l'icona personalizzata (pallino rosso con numero)
  const createCountIcon = (count) => {
    return new L.DivIcon({
      html: `<div>${count}</div>`,
      className: 'marker-counter-pin', // Assicurati che questa classe esista nel tuo CSS
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    });
  };

  // Centro di default (Roma), usato solo se non ci sono aree valide
  const defaultCenter = [41.9028, 12.4964];

  return (
    // Contenitore mappa con altezza fissa
    <div style={{ height: "600px", width: "100%", borderRadius: "12px", overflow: "hidden", border: "1px solid #e5e7eb", zIndex: 0, position: "relative" }}>
      <MapContainer 
        center={defaultCenter} 
        zoom={6} 
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true} // Riattivato scroll per comodità
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Componente invisibile che gestisce lo zoom automatico */}
        <AutoZoom aree={aree} />

        {aree && aree.map((area) => {
          // Se l'area non ha coordinate o sono 0,0, saltala
          if (!area.latitude || !area.longitude || (area.latitude === 0 && area.longitude === 0)) return null;

          const numPresenti = conteggi[area.id] || 0;

          return (
            <Marker 
              key={area.id} 
              position={[area.latitude, area.longitude]}
              // Se presenti > 0 usa icona rossa numerata, altrimenti icona standard blu
              icon={numPresenti > 0 ? createCountIcon(numPresenti) : new L.Icon.Default()}
            >
              <Popup>
                <div className="text-center p-2">
                  <strong className="block text-lg mb-1">{area.name}</strong>
                  <div className={`text-sm font-bold mb-1 ${numPresenti > 0 ? "text-green-600" : "text-gray-500"}`}>
                    {numPresenti > 0 ? `🟢 ${numPresenti} Presenti` : "⚪ Nessuno presente"}
                  </div>
                  <hr className="my-1 border-gray-200"/>
                  <span className="text-xs text-gray-400">Raggio: {area.radius}m</span>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MappaPresenze;