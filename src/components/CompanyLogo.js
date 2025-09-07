import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center">
        <p className="text-xs font-serif font-bold text-gray-700 mb-2">
            Creata da Domenico Leoncino
        </p>
        
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo TCS" 
            // *** MODIFICA: Immagine ancora più piccola su mobile (h-10) ***
            className="h-10 sm:h-16 w-auto" 
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        
        {/* *** MODIFICA: Testo più piccolo su mobile (text-lg) *** */}
        <h2 className="text-lg sm:text-2xl font-bold text-gray-800 mt-2">TCS ITALIA S.r.l.</h2>
        <p className="text-xs sm:text-sm text-gray-500">Technology Corporation Service</p>
    </div>
);

export default CompanyLogo;

