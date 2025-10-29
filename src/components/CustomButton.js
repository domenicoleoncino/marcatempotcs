// File: src/components/CustomButton.js

import React from 'react';

// Stile di base Tailwind per tutti i pulsanti
const baseClasses = 
  "px-4 py-2 font-medium rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed text-sm";

// Funzione helper per gestire la colorazione dinamica
const getColorClasses = (color) => {
  switch (color) {
    case 'blue':
      return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500';
    case 'green':
      return 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500';
    case 'red':
      return 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500';
    case 'gray':
    case 'yellow':
    case 'orange':
    case 'teal': // Per il pulsante "Aggiungi Dipendente" del preposto
      return `bg-${color}-600 text-white hover:bg-${color}-700 focus:ring-${color}-500`;
    case 'indigo':
    default:
      return 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500';
  }
};

const CustomButton = ({ 
  onClick, 
  children, 
  color = 'indigo', 
  disabled = false, 
  type = 'button',
  className = ''
}) => {
  const colorClasses = getColorClasses(color);
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${colorClasses} ${className}`}
    >
      {children}
    </button>
  );
};

export default CustomButton;