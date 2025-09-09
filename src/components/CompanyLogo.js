/**
 * CompanyLogo.js
 * Un componente React che visualizza il logo aziendale.
 * Gestisce anche il caso in cui il logo non si carichi, 
 * mostrando un'immagine sostitutiva (placeholder).
 */
import React from 'react';

// URL diretto del logo aziendale. 
const LOGO_URL = 'https://i.imgur.com/x07K0fN.png';
const PLACEHOLDER_URL = 'https://placehold.co/200x60/cccccc/ffffff?text=Logo';

/**
 * Gestisce l'evento di errore per il tag <img>.
 * @param {React.SyntheticEvent<HTMLImageElement, Event>} e - L'evento di errore.
 */
const handleImageError = (e) => {
  // Impedisce un loop infinito di errori se anche il placeholder non si carica.
  e.target.onerror = null; 
  e.target.src = PLACEHOLDER_URL;
};

const CompanyLogo = () => {
  return (
    <div className="flex flex-col items-center text-center w-full">
      
      <p className="text-xs font-serif font-bold text-gray-700 mb-2">
        Created D Leoncino
      </p>
      
      <img 
        src={LOGO_URL} 
        alt="Logo aziendale TCS" 
        className="h-auto w-full max-w-[140px]" // Stile per mantenere le proporzioni
        onError={handleImageError} // Funzione da chiamare in caso di errore
      />
      
    </div>
  );
};

export default CompanyLogo;