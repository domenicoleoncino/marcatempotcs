import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center w-full">
        <p className="text-xs font-serif font-bold text-gray-700 mb-2">
            Crator D. Leoncino
        </p>
        
        {/* MODIFICA: Dimensioni drasticamente ridotte per mobile */}
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo TCS" 
            className="h-auto w-full max-w-[140px]" 
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        
        <h2 className="text-lg font-bold text-gray-800 mt-2">TCS ITALIA S.r.l.</h2>
    </div>
);

export default CompanyLogo;

