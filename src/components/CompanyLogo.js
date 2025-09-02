import React from 'react';

const CompanyLogo = () => (
    <div className="flex items-center space-x-3">
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo Aziendale" 
            className="logo h-12"
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
    </div>
);

export default CompanyLogo;