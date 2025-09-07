import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center w-full">
        <p className="text-xs font-serif font-bold text-gray-700 mb-2">
            Creata da Domenico Leoncino
        </p>
        
        {/* MODIFICA: Ridotta ulteriormente la larghezza massima del logo */}
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo TCS" 
            className="h-auto w-full max-w-[50px] sm:max-w-[100px]" 
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
        
        {/* MODIFICA: Testi resi più piccoli */}
    </div>
);

export default CompanyLogo;
