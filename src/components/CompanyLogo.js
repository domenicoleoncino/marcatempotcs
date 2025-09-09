/**
 * CompanyLogo.js
 * Visualizza il logo aziendale e gestisce eventuali errori di caricamento.
 */
import React from 'react';

// URL diretto e stabile del logo aziendale.
const LOGO_URL = 'https://i.imgur.com/x07K0fN.png';
const PLACEHOLDER_URL = 'https://placehold.co/200x60/cccccc/ffffff?text=Logo';

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