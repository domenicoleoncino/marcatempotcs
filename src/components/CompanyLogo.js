import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center">
        {/* Testo aggiunto sopra il logo */}
        <p className="text-xs text-gray-500 mb-2">Creata da Domenico Leoncino</p>
        
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo Aziendale" 
            className="h-16 w-auto" // Aumentata leggermente l'altezza per una migliore visibilità
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        <h2 className="text-2xl font-bold text-gray-800 mt-2">TCS ITALIA S.r.l.</h2>
        <p className="text-sm text-gray-500">Technology Corporation Service</p>
    </div>
);

export default CompanyLogo;

