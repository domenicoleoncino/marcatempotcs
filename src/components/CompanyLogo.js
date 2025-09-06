import React from 'react';

const CompanyLogo = () => (
    <div className="flex flex-col items-center text-center">
        {/* MODIFICA: Aggiunte classi per grassetto, font e dimensione */}
        <p className="text-sm font-serif font-bold text-gray-700 mb-2">
            Creata da Domenico Leoncino
        </p>
        
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo TCS" 
            className="h-16 w-auto" 
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
    </div>
);

export default CompanyLogo;



