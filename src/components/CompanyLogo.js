import React from 'react'; // <-- QUESTA È LA RIGA MANCANTE

/**
 * CompanyLogo.js
 * Un componente React che visualizza il logo aziendale.
 * Gestisce anche il caso in cui il logo non si carichi, 
 * mostrando un'immagine sostitutiva (placeholder).
 */

// URL diretto e corretto del logo aziendale.
const LOGO_URL = 'https://i.imgur.com/kUQf7Te.png';
const PLACEHOLDER_URL = 'https://placehold.co/200x60/cccccc/ffffff?text=Logo';

/**
 * Gestisce l'evento di errore per il tag <img>.
 * @param {React.SyntheticEvent<HTMLImageElement, Event>} e - L'evento di errore.
 */
const handleImageError = (e) => {
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
        className="h-auto w-full max-w-[140px]"
        onError={handleImageError}
      />
    </div>
  );
};

export default CompanyLogo;