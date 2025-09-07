import React from 'react';

const CompanyLogo = () => (
    // Il contenitore principale ora occupa tutta la larghezza disponibile
    <div className="flex flex-col items-center text-center w-full">
        <p className="text-xs font-serif font-bold text-gray-700 mb-2">
            Creata da Domenico Leoncino
        </p>
        
        {/* L'immagine ora ha una larghezza massima per non eccedere */}
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo TCS" 
            className="h-auto w-full max-w-[100px] sm:max-w-[180px]" // Altezza automatica, larghezza massima definita
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mt-2">TCS ITALIA S.r.l.</h2>
        <p className="text-sm text-gray-500">Technology Corporation Service</p>
    </div>
);

export default CompanyLogo;

