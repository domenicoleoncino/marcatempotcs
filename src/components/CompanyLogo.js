import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center w-full">
        <p className="text-xs font-serif font-bold text-gray-700 mb-2">
            Created D Leoncino
        </p>
        
        {/* MODIFICA: Dimensioni drasticamente ridotte per mobile */}
        <img 
            src="https://imgur.com/a/UyUnDnN" 
            alt="Logo TCS" 
            className="h-auto w-full max-w-[140px]" 
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        
    </div>
);

export default CompanyLogo;

