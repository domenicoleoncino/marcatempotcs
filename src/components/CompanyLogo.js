import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center">
        <p className="text-xs font-serif font-bold text-gray-700 mb-2">
            Creata da Domenico Leoncino
        </p>
        
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo TCS" 
            // *** MODIFICA: Ridimensionata l'immagine per mobile (h-12) e desktop (sm:h-16) ***
            className="h-12 sm:h-16 w-auto" 
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        
        {/* *** MODIFICA: Ridimensionato il testo per mobile e desktop *** */}
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mt-2">TCS ITALIA S.r.l.</h2>
        <p className="text-xs sm:text-sm text-gray-500">Technology Corporation Service</p>
    </div>
);

export default CompanyLogo;

