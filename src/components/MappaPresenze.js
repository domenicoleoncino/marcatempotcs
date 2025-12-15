// File: src/components/MappaPresenze.js
import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
      className: 'marker-counter-pin', // Classe CSS definita in index.css
      iconSize: [30, 30], // Dimensione
      iconAnchor: [15, 15], // Centro
      popupAnchor: [0, -15]
    });
  };

  // Centro di default (Roma/Italia), o cambialo con la tua sede
  const center = [41.9028, 12.4964];

  return (
    // Contenitore mappa con altezza fissa e z-index basso per non coprire i menu
    <div style={{ height: "400px", width: "100%", borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e7eb", zIndex: 0, position: "relative" }}>
      <MapContainer 
        center={center} 
        zoom={6} 
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false} // Evita zoom accidentale
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {aree && aree.map((area) => {
          // Se l'area non ha coordinate, saltala
          if (!area.latitude || !area.longitude) return null;

          const numPresenti = conteggi[area.id] || 0;

          return (
            <Marker 
              key={area.id} 
              position={[area.latitude, area.longitude]}
              // Se presenti > 0 usa icona rossa numerata, altrimenti icona standard blu
              icon={numPresenti > 0 ? createCountIcon(numPresenti) : new L.Icon.Default()}
            >
              <Popup>
                <div className="text-center">
                  <strong className="block text-lg">{area.name}</strong>
                  <span className={numPresenti > 0 ? "text-green-600 font-bold" : "text-gray-500"}>
                    {numPresenti} Presenti ora
                  </span>
                  <br/>
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