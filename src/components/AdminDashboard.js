/* eslint-disable no-unused-vars */
/* global __firebase_config, __initial_auth_token, __app_id */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
     collection, getDocs, query, where,
     Timestamp, onSnapshot, updateDoc, doc, limit
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal'; 
import { utils, writeFile } from 'xlsx';
import { saveAs } from 'file-saver';
//import 'jspdf-autotable';

// ===========================================
// --- SUB-COMPONENTI E FUNZIONI INIZIALI ---
// ===========================================

// === NUOVO COMPONENTE PER MESSAGGI NON BLOCCANTI ===
const NotificationPopup = ({ message, type, onClose }) => {
    const baseClasses = "fixed top-4 left-1/2 transform -translate-x-1/2 z-50 p-4 rounded-lg shadow-xl text-white transition-opacity duration-300";
    const typeClasses = {
        success: "bg-green-500",
        error: "bg-red-500",
        info: "bg-blue-500"
    };

    return (
        <div className={`${baseClasses} ${typeClasses[type]}`}>
            <p className="font-semibold">{type === 'error' ? 'ERRORE:' : 'Successo:'}</p>
            <p className="text-sm">{message}</p>
            <button onClick={onClose} className="absolute top-1 right-2 text-lg font-bold">&times;</button>
        </div>
    );
};
// ===============================================

const DashboardView = ({ totalEmployees, activeEmployeesDetails, totalDayHours }) => (
    <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4">Dashboard</h1>
        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                <p className="text-sm text-gray-500">Dipendenti Attivi</p>
                <p className="2xl font-bold text-gray-800">{activeEmployeesDetails.length} / {totalEmployees}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                <p className="text-sm text-gray-500">Ore Lavorate Oggi (Totali)</p>
                <p className="2xl font-bold text-gray-800">{totalDayHours}</p>
            </div>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3">Chi è al Lavoro Ora</h2>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            {activeEmployeesDetails.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {activeEmployeesDetails.map(entry => (
                            <tr key={entry.id}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.employeeName}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.areaName}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInTimeFormatted}</td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{entry.status}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : <p className="p-4 text-sm text-gray-500">Nessun dipendente (tra quelli che gestisci) è attualmente al lavoro.</p>}
        </div>
    </div>
);

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm, handleResetEmployeeDevice, adminEmployeeId, handleEmployeePauseClick }) => { 
    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return '';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
                {/* Pulsante per Admin */}
                {currentUserRole === 'admin' && <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Crea Nuovo Dipendente</button>}

                {/* --- PULSANTE PER PREPOSTO (per aggiungere dipendenti esistenti alle sue aree) --- */}
                {currentUserRole === 'preposto' && (
                    <button
                        onClick={() => openModal('prepostoAddEmployeeToAreas', null)} 
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 w-full sm:w-auto text-sm"
                    >
                        Aggiungi Dipendente alle Mie Aree
                    </button>
                )}
                {/* --- FINE PULSANTE --- */}
            </div>
            <div className="mb-4">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cerca dipendente per nome o cognome..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('name')}>Nome{getSortIndicator('name')}</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Assegnate</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {employees.map(emp => {
                            
                            // *** LOGICA DI DISCRIMINAZIONE PER LA TIMBRATURA ***
                            const isSelfClockIn = emp.id === adminEmployeeId;
                            // Tipologia Entrata Manuale/Forzata
                            const clockInType = isSelfClockIn ? 'manualClockIn' : 'adminClockIn'; 
                            // Tipologia Uscita Manuale/Forzata (CORRETTA: Usa adminClockOut per gli altri)
                            const clockOutType = isSelfClockIn ? 'manualClockOut' : 'adminClockOut'; 
                            // ************************************************

                            return ( 
                                <tr key={emp.id}>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{emp.name} {emp.surname}</div>
                                        <div className="text-xs text-gray-500 break-all">{emp.email}</div>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.activeEntry ? (emp.activeEntry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800') : 'bg-red-100 text-red-800'}`}>
                                            {emp.activeEntry ? emp.activeEntry.status : 'Non al Lavoro'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'Nessuna'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                        <div className="flex flex-col items-start gap-1">
                                            {/* Pulsanti Timbratura/Pausa (visibili a tutti) */}
                                            {emp.activeEntry ? (
                                                <>
                                                    {/* TIMBRA USCITA (CORRETTO ROUTING) */}
                                                    <button
                                                        onClick={() => openModal(clockOutType, emp)} // <-- USA clockOutType
                                                        disabled={emp.activeEntry.status === 'In Pausa'}
                                                        className={`px-2 py-1 text-xs text-white rounded-md w-full text-center ${
                                                            emp.activeEntry.status === 'In Pausa'
                                                            ? 'bg-gray-400 cursor-not-allowed'
                                                            : 'bg-yellow-500 hover:bg-yellow-600'
                                                        }`}
                                                    >
                                                        Timbra Uscita
                                                    </button>

                                                    {/* APPLICA PAUSA */}
                                                    <button
                                                        onClick={() => handleEmployeePauseClick(emp)} // <--- CHIAMATA DIRETTA ALLA PAUSA
                                                        disabled={!emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end)} // Disabilita se pausa già completata
                                                        className={`px-2 py-1 text-xs text-white rounded-md w-full text-center mt-1 ${
                                                            !emp.activeEntry || emp.activeEntry.status === 'In Pausa' || emp.activeEntry.pauses?.some(p => p.start && p.end)
                                                            ? 'bg-gray-400 cursor-not-allowed'
                                                            : 'bg-orange-500 hover:bg-orange-600'
                                                        }`}
                                                    >
                                                        Applica Pausa
                                                    </button>
                                                </>
                                            ) : (
                                                /* TIMBRA ENTRATA */
                                                <button onClick={() => openModal(clockInType, emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button> // <-- USA clockInType
                                            )}
                                            {/* Pulsanti specifici per Admin */}
                                            <div className="flex flex-col sm:flex-row gap-2 w-full justify-start mt-1 items-start sm:items-center">
                                                {currentUserRole === 'admin' && (
                                                    <>
                                                        <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap">Assegna Aree (Tutte)</button>
                                                        <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                        <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                    </>
                                                )}
                                                {/* Pulsanti specifici per Preposto/Admin - RESET DEVICE */}
                                                <div className="flex gap-2">
                                                    {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                                        <button onClick={() => handleResetEmployeeDevice(emp)} disabled={emp.deviceIds?.length === 0} className="text-xs px-2 py-1 bg-yellow-500 text-gray-800 rounded-md hover:bg-yellow-600 whitespace-nowrap disabled:bg-gray-400 disabled:cursor-not-allowed">
                                                            Reset Device
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                {currentUserRole === 'preposto' && (
                                                    <button onClick={() => openModal('assignEmployeeToPrepostoArea', emp)} className="text-xs text-blue-600 hover:text-blue-900 whitespace-nowrap">Gestisci Mie Aree</button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                 {/* Aggiunta messaggio se la lista filtrata è vuota */}
                 {employees.length === 0 && searchTerm === '' && currentUserRole === 'preposto' && (
                     <p className="p-4 text-sm text-gray-500">Nessun dipendente attualmente assegnato alle tue aree di gestione. Usa il pulsante "Aggiungi Dipendente..." per assegnarne.</p>
                 )}
                 {employees.length === 0 && searchTerm !== '' && (
                     <p className="p-4 text-sm text-gray-500">Nessun dipendente trovato per "{searchTerm}".</p>
                 )}
            </div>
        </div>
    );
};

const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => (
    // ... [Logica omessa per brevità] ...
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Aree di Lavoro</h1>
            {currentUserRole === 'admin' && <button onClick={() => openModal('newArea')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Area</button>}
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome Area</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore Totali (nel report)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pausa (min)</th>
                        {currentUserRole === 'admin' && (
                            <>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lat</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lon</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raggio (m)</th>
                            </>
                        )}
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {workAreas.map(area => (
                        <tr key={area.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{area.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold">{area.totalHours ? `${area.totalHours}h` : 'N/D'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-700">{area.pauseDuration || 0}</td>
                            {currentUserRole === 'admin' && (
                                <>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{area.latitude?.toFixed(4) || 'N/D'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{area.longitude?.toFixed(4) || 'N/D'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{area.radius || 'N/D'}</td>
                                </>
                            )}
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center gap-4">
                                    {(currentUserRole === 'admin' || currentUserRole === 'preposto') && <button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-900">Modifica</button>}
                                    {currentUserRole === 'admin' && <button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-900">Elimina</button>}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

// === NUOVO COMPONENTE PER LA GESTIONE ADMIN/PREPOSTI ===
const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole, onDataUpdate }) => {
    
    // Mostra solo il contenuto se l'utente è ADMIN
    if (currentUserRole !== 'admin') {
         return <div className="p-4 text-sm text-red-600 font-medium">Accesso negato. Solo gli amministratori hanno accesso a questa sezione.</div>;
    }

    const isSuperAdmin = user?.email === superAdminEmail;
    
    // FILTRO CHIAVE: Rimuove l'utente Super Admin dalla lista visualizzata
    const filteredAdmins = admins.filter(admin => admin.email !== superAdminEmail);


    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Utenti Admin/Preposti</h1>
                {/* Il Super Admin può creare nuovi admin/preposti */}
                {isSuperAdmin && (
                    <button onClick={() => openModal('newAdmin')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Crea Nuovo Admin/Preposto</button>
                )}
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
                In questa lista sono inclusi tutti gli utenti con ruolo "admin" e "preposto" (eccetto il Super Admin).
            </p>

            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utente</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruolo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Gestite</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAdmins.map(admin => ( // <-- Usa filteredAdmins
                            <tr key={admin.id}>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{admin.name} {admin.surname}</div>
                                    <div className="text-xs text-gray-500 break-all">{admin.email}</div>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-semibold text-gray-700 capitalize">{admin.role}</td>
                                <td className="px-4 py-2 whitespace-normal text-sm text-gray-500">{admin.managedAreaNames?.join(', ') || 'Nessuna Area'}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-2">
                                        
                                        {/* Elimina utente (Solo Super Admin può eliminare Admin, Admin può eliminare Preposto) */}
                                        {(isSuperAdmin || (currentUserRole === 'admin' && admin.role === 'preposto')) && (
                                            <button 
                                                onClick={() => openModal('deleteUser', admin)} 
                                                className="text-red-600 hover:text-red-900 text-xs"
                                                disabled={admin.email === user?.email} // Non puoi eliminare te stesso
                                            >
                                                Elimina
                                            </button>
                                        )}

                                        {/* Assegna Aree (Solo se è un Preposto) */}
                                        {admin.role === 'preposto' && (
                                            <button 
                                                onClick={() => openModal('assignPrepostoAreas', admin)} 
                                                className="text-blue-600 hover:text-blue-900 text-xs"
                                            >
                                                Assegna Aree
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredAdmins.length === 0 && (
                    <p className="p-4 text-sm text-gray-500">Nessun utente Admin/Preposto trovato (eccetto l'utente Super Admin corrente).</p>
                )}
            </div>
        </div>
    );
};

// === REPORT VIEW COMPLETO CON PULSANTI DI ESPORTAZIONE ===
const ReportView = ({ reports, title, handleExportXml, dateRange, allWorkAreas, allEmployees, currentUserRole, userData, setDateRange, setReportAreaFilter, reportAreaFilter, reportEmployeeFilter, setReportEmployeeFilter, generateReport, isLoading, isActionLoading, managedEmployees, showNotification }) => {
    
    // --- FUNZIONE ESPORTAZIONE EXCEL ---
    const handleExportExcel = () => {
        if (typeof utils === 'undefined' || typeof writeFile === 'undefined') {
            showNotification("Libreria esportazione non caricata.", 'error'); return;
        }
        if (!reports || reports.length === 0) {
            showNotification("Nessun dato da esportare.", 'info'); return;
        }
        
        const dataToExport = reports.map(entry => ({
            'Dipendente': entry.employeeName, 
            'Area': entry.areaName, 
            'Data': entry.clockInDate,
            'Entrata': entry.clockInTimeFormatted, 
            'Uscita': entry.clockOutTimeFormatted,
            'Ore Lavorate (Netto)': (entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso",
            'Pausa Totale (Ore)': (entry.pauseHours !== null) ? parseFloat(entry.pauseHours.toFixed(2)) : 0, 
            'Motivo/Nota': entry.note
        }));
        
        const ws = utils.json_to_sheet(dataToExport);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Report Ore");
        
        ws['!cols'] = [
            { wch: 20 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, 
            { wch: 20 },
            { wch: 20 }, 
            { wch: 30 }
        ];
        
        writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`);
        showNotification(`File Excel '${(title || 'Report').replace(/ /g, '_')}.xlsx' generato con successo.`, 'success');
    };
    // --- FINE FUNZIONE ESPORTAZIONE EXCEL ---


    return (
        <div>
            {/* Form Genera Report (Dato che è già renderizzato sopra, qui non lo ripetiamo) */}

            {/* SEZIONE PULSANTI DI ESPORTAZIONE */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report Risultati'}</h1>
                <div className="flex items-center space-x-2">
                    {/* PULSANTI DI ESPORTAZIONE VISIBILI SOLO SE CI SONO DATI */}
                    <button onClick={handleExportExcel} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
                    <button onClick={() => handleExportXml(reports)} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-sm">Esporta XML</button>
                </div>
            </div>
            
            {/* TABELLA DEI RISULTATI */}
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                {!reports || reports.length === 0 ? <p className="p-4 text-sm text-gray-500">Nessun dato per il periodo selezionato.</p> : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pausa (Ore)</th> 
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo/Nota</th> 
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reports.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.employeeName}{entry.createdBy && entry.employeeId && entry.createdBy !== entry.employeeId ? <span className="text-red-500 ml-1 font-bold">*</span> : ''}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.areaName}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInDate}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInTimeFormatted}</td> 
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockOutTimeFormatted}</td> 
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.duration !== null ? entry.duration.toFixed(2) : '...'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.pauseHours !== null ? entry.pauseHours.toFixed(2) : '0.00'}</td> 
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{entry.note}</td> 
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
// =======================================================


// --- COMPONENTE PRINCIPALE ---
const AdminDashboard = ({ user, handleLogout, userData }) => {

    const [view, setView] = useState('dashboard');
    const [allEmployees, setAllEmployees] = useState([]); 
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeEmployeesDetails, setActiveEmployeesDetails] = useState([]);
    const [reports, setReports] = useState([]);
    const [reportTitle, setReportTitle] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isLoading, setIsLoading] = useState(false); // Inizializzato a false
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [reportAreaFilter, setReportAreaFilter] = useState('all');
    const [reportEmployeeFilter, setReportEmployeeFilter] = useState('all');
    const [adminEmployeeProfile, setAdminEmployeeProfile] = useState(null);
    const [adminActiveEntry, setAdminActiveEntry] = useState(null);
    const [totalDayHours, setTotalDayHours] = useState('0.00');
    const [workAreasWithHours, setWorkAreasWithHours] = useState([]);
    
    // === STATO NUOVO PER NOTIFICHE ===
    const [notification, setNotification] = useState(null); // { message, type }

    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000); // Nascondi dopo 4 secondi
    }, []);
    // ==================================

    const currentUserRole = userData?.role;
    // VARIABILE ESSENZIALE PER I CONTROLLI DI ADMIN/SUPERADMIN
    const superAdminEmail = "domenico.leoncino@tcsitalia.com"; 

    // --- CORREZIONE AMBITO (1): managedEmployees è definito PRIMA di sortedAndFilteredEmployees ---
    const managedEmployees = useMemo(() => {
        if (currentUserRole === 'admin') {
            return allEmployees;
        }

        if (currentUserRole === 'preposto') {
            const managedAreaIds = userData?.managedAreaIds || []; 
            if (managedAreaIds.length === 0) {
                 return [];
            }
            
            const filtered = allEmployees.filter(emp =>
                emp.workAreaIds &&
                emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId))
            );
            return filtered;
        }

        return []; 
    }, [allEmployees, currentUserRole, userData]);


    // --- CARICAMENTO DATI (fetchData - CORREZIONE isMounted) ---
    const fetchData = useCallback(async () => {
        if (!user || !userData) { setIsLoading(false); return; }
        const role = userData?.role;
        if (role !== 'admin' && role !== 'preposto') { setIsLoading(false); return; }
        
        let isMounted = true; 
        setIsLoading(true);
        
        try {
            const [areasSnap, empsSnap] = await Promise.all([
                getDocs(collection(db, "work_areas")),
                getDocs(collection(db, "employees")) 
            ]);
            
            if (!isMounted) return;

            const allAreasList = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allEmployeesList = empsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setAllWorkAreas(allAreasList);
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));
            setAllEmployees(allEmployeesList); 

            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) {
                 const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                 const adminEmployeeSnapshot = await getDocs(q);
                 if (!isMounted) return; 
                 const profile = adminEmployeeSnapshot.empty ? null : { id: adminEmployeeSnapshot.docs[0].id, userId: user.uid, ...adminEmployeeSnapshot.docs[0].data() };
                 setAdminEmployeeProfile(profile);
            } else {
                 setAdminEmployeeProfile(null); 
            }

            if (role === 'admin') {
                const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
                const adminsSnapshot = await getDocs(qAdmins);
                if (!isMounted) return; 
                const adminUsers = adminsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                    return { id: doc.id, ...data, managedAreaNames };
                });
                setAdmins(adminUsers);
            } else {
                setAdmins([]); 
            }
        } catch (error) {
            console.error("Errore caricamento dati statici:", error);
            if (isMounted) showNotification("Errore caricamento dati iniziali. Controlla console.", 'error');
        } finally {
            if (isMounted) setIsLoading(false);
        }
        
        return () => {
             isMounted = false; 
        };

    }, [user, userData, superAdminEmail, showNotification]);

    useEffect(() => {
        if (user && userData) fetchData();
    }, [user, userData, fetchData]); 


    // --- CALCOLI MEMOIZED (sortedAndFilteredEmployees) ---
    const sortedAndFilteredEmployees = useMemo(() => {
        const employeesWithDetails = managedEmployees.map(emp => ({
            ...emp,
            workAreaNames: (emp.workAreaIds || []).map(id => {
                const area = allWorkAreas.find(a => a.id === id);
                return area ? area.name : `ID Mancante: ${id.substring(0, 5)}...`; 
            }).filter(Boolean),
            activeEntry: activeEmployeesDetails.find(detail => detail.employeeId === emp.id) || null,
        }));
        
        let filterableItems = [...employeesWithDetails];
        
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filterableItems = filterableItems.filter(emp => `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter));
        }
        
        if (sortConfig.key) {
             filterableItems.sort((a, b) => { 
                 let aValue = (sortConfig.key === 'name') ? `${a.name} ${a.surname}` : a[sortConfig.key];
                 let bValue = (sortConfig.key === 'name') ? `${b.name} ${b.surname}` : b[sortConfig.key];

                 if (aValue == null) aValue = ''; 
                 if (bValue == null) bValue = '';
                 aValue = String(aValue);
                 bValue = String(bValue);

                 if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                 if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                 return 0;
             });
        }
        return filterableItems;
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig]);


    // --- LISTENER TIMBRATURE ATTIVE (ROBUSTO con isMounted) ---
    useEffect(() => {
        if (!allEmployees.length || !allWorkAreas.length) return;

        let isMounted = true; 

        const q = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!isMounted) return; 

            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (adminEmployeeProfile) {
                const adminEntry = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                const hasCompletedPause = adminEntry?.pauses?.some(p => p.start && p.end) || false;
                setAdminActiveEntry(adminEntry ? { ...adminEntry, id: adminEntry.id, isOnBreak: adminEntry.pauses?.some(p => !p.end) || false, hasCompletedPause: hasCompletedPause } : null);
            }

            const details = activeEntriesList
                .filter(entry => entry.clockInTime) 
                .map(entry => {
                    const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                    const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                    const isOnBreak = entry.pauses?.some(p => !p.end) || false; 
                    const hasCompletedPause = entry.pauses?.some(p => p.start && p.end) || false; 

                    let clockInFormatted = 'N/D';
                    
                    if (entry.clockInTime && typeof entry.clockInTime.toDate === 'function') {
                        try {
                           const clockInDate = entry.clockInTime.toDate();
                           clockInFormatted = new Intl.DateTimeFormat('it-IT', {
                               hour: '2-digit',
                               minute: '2-digit',
                               timeZone: 'Europe/Rome' 
                           }).format(clockInDate);
                           
                        } catch (e) { console.error("Errore formattazione ora entrata:", e); }
                    }

                    return {
                        id: entry.id,
                        employeeId: entry.employeeId,
                        employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
                        areaName: area ? area.name : 'Sconosciuta',
                        workAreaId: entry.workAreaId,
                        clockInTimeFormatted: clockInFormatted, 
                        status: isOnBreak ? 'In Pausa' : 'Al Lavoro', 
                        pauses: entry.pauses || [],
                        hasCompletedPause: hasCompletedPause 
                    };
                })
                .filter(detail => {
                    if (currentUserRole === 'admin') return true; 
                    if (currentUserRole === 'preposto') {
                         const managedAreaIds = userData?.managedAreaIds || []; 
                         if (managedAreaIds.length === 0) return false; 

                        const employee = allEmployees.find(emp => emp.id === detail.employeeId);
                        return employee?.workAreaIds?.some(waId => managedAreaIds.includes(waId));
                    }
                    return false; 
                })
                .sort((a, b) => a.employeeName.localeCompare(b.employeeName)); 

            setActiveEmployeesDetails(details);
        }, (error) => {
             if (isMounted) { 
                 console.error("Errore listener timbratura attive:", error);
                 showNotification("Errore aggiornamento presenze.", 'error');
             }
        });
        return () => {
            isMounted = false; 
            unsubscribe(); 
        };
    }, [allEmployees, allWorkAreas, adminEmployeeProfile, currentUserRole, userData, showNotification]);


    // --- LISTENER ORE TOTALI (ROBUSTO con isMounted) ---
    useEffect(() => {
        let isMounted = true; 
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!isMounted) return; 

            let totalMinutes = 0; const now = new Date();
            snapshot.docs.forEach(doc => {
                const entry = doc.data();
                if (!entry.clockInTime) return;

                if (currentUserRole === 'preposto') {
                     const managedAreaIds = userData?.managedAreaIds || []; 
                     if (managedAreaIds.length === 0) return; 

                     const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                     if (!employee || !employee.workAreaIds?.some(waId => managedAreaIds.includes(waId))) {
                          return; 
                     }
                 }

                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : (entry.status === 'clocked-in' ? now : clockIn);
                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    if (p.start && p.end) {
                        const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                        const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                        return acc + (endMillis - startMillis);
                    }
                    return acc;
                }, 0);

                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;
                if (durationMs > 0) totalMinutes += (durationMs / 60000);
            });
            setTotalDayHours((totalMinutes / 60).toFixed(2));
        }, (error) => {
            if (isMounted) { 
                 console.error("Errore listener ore totali:", error);
                 showNotification("Errore aggiornamento ore totali.", 'error');
             }
        });
        return () => {
            isMounted = false; 
            unsubscribe();
        };
    }, [currentUserRole, userData, allEmployees, showNotification]);


    // --- FUNZIONI HANDLER (AGGIORNATE PER LA PAUSA UNIFICATA) ---
    const handleAdminClockIn = useCallback(async (areaId, timestamp, note) => {
        if (!adminEmployeeProfile) return showNotification("Profilo dipendente non trovato.", 'error');
        console.log(`[AdminDashboard] Tentativo Timbratura ENTRATA manuale per ${adminEmployeeProfile.name}`);
    }, [adminEmployeeProfile, showNotification]);

    const handleAdminClockOut = useCallback(async (note) => { 
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva trovata.", 'error');
        console.log(`[AdminDashboard] Tentativo Timbratura USCITA manuale per ${adminEmployeeProfile.name}`);
    }, [adminActiveEntry, adminEmployeeProfile, showNotification]);

    // FUNZIONE PER PAUSA PERSONALE (Preposto/Admin Loggato)
    const handleAdminPause = useCallback(async () => {
        if (!adminEmployeeProfile) return showNotification("Profilo dipendente non trovato.", 'error');
        if (!adminActiveEntry) return showNotification("Nessuna timbratura attiva trovata.", 'error');
        
        // 1. Logica per TERMINARE la pausa (Se è già in pausa, l'unica azione possibile è chiuderla)
        if (adminActiveEntry.isOnBreak) {
            setIsActionLoading(true);
            try {
                const togglePauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'prepostoTogglePause');
                const result = await togglePauseFunction({ deviceId: 'ADMIN_MANUAL_ACTION' });
                showNotification(result.data.message, 'success'); 
            } catch (error) { 
                const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message;
                showNotification(`Errore pausa: ${displayMessage || 'Errore Server.'}`, 'error'); 
                console.error(error); 
            }
            finally { setIsActionLoading(false); }
            return; 
        }
        
        // 2. Logica per INIZIARE la pausa (solo se NON in pausa e NON completata)
        if (adminActiveEntry.hasCompletedPause) {
             return showNotification("Hai già completato la pausa automatica in questa sessione.", 'info');
        }
        
        // Trova l'area e la sua durata pausa predefinita
        const workArea = allWorkAreas.find(area => area.id === adminActiveEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) {
            return showNotification(`Nessuna pausa predefinita (>0 min) configurata per l'area "${workArea?.name || 'sconosciuta'}".`, 'info');
        }
        const pauseDurationInMinutes = workArea.pauseDuration;
        
        if (!window.confirm(`Applicare la pausa predefinita di ${pauseDurationInMinutes} minuti per te stesso? L'azione è immediata e irreversibile.`)) {
             return;
        }

        setIsActionLoading(true);
        try {
            const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee');
            const result = await applyPauseFunction({ timeEntryId: adminActiveEntry.id, durationMinutes: pauseDurationInMinutes, deviceId: 'ADMIN_MANUAL_ACTION' });
            showNotification(result.data.message, 'success'); 
        } catch (error) { 
            const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message;
            showNotification(`Errore pausa: ${displayMessage || 'Errore Server.'}`, 'error'); 
            console.error(error); 
        }
        finally { setIsActionLoading(false); }
    }, [adminActiveEntry, adminEmployeeProfile, allWorkAreas, showNotification]);


    // FUNZIONE: GESTISCE IL CLICK SULLA PAUSA DEL DIPENDENTE (BYPASS MODALE) - CORREZIONE ID TIMBRATURA
    const handleEmployeePauseClick = useCallback(async (employee) => {
        const timeEntryId = employee?.activeEntry?.id; // L'ID TIMBRATURA ATTIVA

        if (!timeEntryId) return showNotification("Errore: ID della timbratura attiva non trovato.", 'error');
        
        const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
        
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) {
            return showNotification(`Nessuna pausa predefinita configurata per l'area "${workArea?.name || 'sconosciuta'}". Modifica l'area per aggiungerla.`, 'info');
        }
        const pauseDurationInMinutes = workArea.pauseDuration;
        
        // Controlla se la pausa è già stata completata in questa sessione
        if (employee.activeEntry.hasCompletedPause) {
             return showNotification(`La pausa predefinita di ${pauseDurationInMinutes} minuti è stata già completata per ${employee.name} in questa sessione.`, 'info');
        }


        if (!window.confirm(`Applicare la pausa predefinita di ${pauseDurationInMinutes} minuti a ${employee.name} ${employee.surname}? L'azione è immediata e irreversibile.`)) {
             return;
        }


        setIsActionLoading(true);
        try {
            const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee');
            const result = await applyPauseFunction({ 
                timeEntryId: timeEntryId, // PASSATO ID TIMBRATURA CORRETTO
                durationMinutes: pauseDurationInMinutes, 
                deviceId: 'PREPOSTO_MANUAL_ACTION',
                employeeIdToUpdate: employee.id // ID del DIPENDENTE (per la Cloud Function)
            });
            showNotification(result.data.message, 'success');
        } catch (error) { 
            console.error("Errore applicazione pausa (Server):", error);
            const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message;
            showNotification(`Errore applicazione pausa: ${displayMessage || 'Errore Server.'}`, 'error'); 
        }
        finally {
            setIsActionLoading(false);
        }
    }, [allWorkAreas, showNotification]);


    const openModal = useCallback((type, item = null) => {
        setModalType(type);
        setSelectedItem(item);
        setShowModal(true);
    }, []);

    // FUNZIONE DI RESET DEVICE (SENZA ALERT NATIVI)
    const handleResetEmployeeDevice = useCallback(async (employee) => {
        if (!employee || !employee.id) return showNotification("Dipendente non valido.", 'error');
        
        if (!window.confirm(`Sei sicuro di resettare il dispositivo per ${employee.name} ${employee.surname}?`)) return;

        setIsActionLoading(true);
        try {
            const employeeRef = doc(db, "employees", employee.id);
            await updateDoc(employeeRef, { deviceIds: [] });
            showNotification(`Dispositivo resettato per ${employee.name} ${employee.surname}.`, 'success');
            await fetchData();
        } catch (error) {
            console.error("Errore reset dispositivo:", error);
            showNotification(`Errore reset dispositivo: ${error.message}`, 'error'); 
        } finally {
            setIsActionLoading(false);
        }
    }, [fetchData, showNotification]);
    
    // --- FUNZIONE GENERATE REPORT (COMPLETA - ORA CHIAMA LA CLOUD FUNCTION) ---
    const generateReport = useCallback(async () => {
        if (!dateRange.start || !dateRange.end) return showNotification("Seleziona date valide.", 'info');
        setIsLoading(true);
        
        let isMounted = true; 
        
        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const generateReportFunction = httpsCallable(functions, 'generateTimeReport');

            // Chiama la Cloud Function con i filtri
            const result = await generateReportFunction({
                startDate: dateRange.start, // Passiamo le date
                endDate: dateRange.end,
                employeeIdFilter: reportEmployeeFilter, // Passa i filtri
                areaIdFilter: reportAreaFilter
            });

            if (!isMounted) return; 

            // Recupera i dati serializzati dalla Cloud Function
            const fetchedEntries = result.data.reports;
            
            const areaHoursMap = new Map(allWorkAreas.map(area => [area.id, 0]));

            // Definiamo formatTime qui, dove è usato.
            const formatTime = (date, time) => {
                // Se l'uscita è 'In corso', usa un orario molto tardivo per l'ordinamento
                const finalTime = time === 'In corso' ? '99:99' : time;
                // Converte dd/mm/yyyy in yyyy-mm-dd per la data (necessario per new Date())
                const formattedDate = date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
                return new Date(`${formattedDate} ${finalTime}`);
            };


            const reportData = fetchedEntries.map(entry => {
                
                // 1. Riconverti le stringhe ISO in oggetti Date
                const clockIn = entry.clockInTime ? new Date(entry.clockInTime) : null;
                const clockOut = entry.clockOutTime ? new Date(entry.clockOutTime) : null;
                
                if (!clockIn) return null; // Salta entry non valide

                // 2. Recupera info Employee/Area
                const employee = allEmployees.find(e => e.id === entry.employeeId);
                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                if (!employee || !area) return null; // Filtra se mancano metadati locali

                let durationHours = null;
                let pauseDurationMinutes = 0; 
                let pauseHours = 0; 
                let clockInFormatted = 'N/D';
                let clockOutFormatted = 'In corso';

                // 3. Formattazione
                try {
                    clockInFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockIn);
                    if (clockOut) {
                        clockOutFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockOut);
                    }
                } catch (e) { console.error("Errore formattazione ora report:", e); }


                // 4. Calcolo Durata e Pausa
                if (clockOut) {
                    const totalMs = clockOut.getTime() - clockIn.getTime();
                    
                    // Ricalcolo Pause (dopo la conversione in Date)
                    const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                        const pauseStart = p.start ? new Date(p.start) : null;
                        const pauseEnd = p.end ? new Date(p.end) : null;

                        if (pauseStart && pauseEnd) {
                            return acc + (pauseEnd.getTime() - pauseStart.getTime());
                        } return acc;
                    }, 0);
                    
                    pauseDurationMinutes = pauseDurationMs / 60000;
                    pauseHours = pauseDurationMinutes / 60; 

                    let calculatedDurationMs = totalMs - pauseDurationMs;
                    durationHours = calculatedDurationMs > 0 ? (calculatedDurationMs / 3600000) : 0; 
                    areaHoursMap.set(area.id, (areaHoursMap.get(area.id) || 0) + durationHours);
                }
                return {
                    id: entry.id,
                    employeeName: `${employee.name} ${employee.surname}`,
                    employeeId: entry.employeeId,
                    areaName: area.name,
                    // Assicurati che clockInDate sia un oggetto Date valido per la formattazione
                    clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    clockInFormatted, 
                    clockOutFormatted, 
                    duration: durationHours,
                    pauseHours: pauseHours, 
                    note: entry.note || '',
                    createdBy: entry.createdBy || null,
                };
            }).filter(Boolean)
              .sort((a, b) => {
                  // === Ordinamento per data/ora di timbratura ===
                  
                  const dateA = formatTime(a.clockInDate, a.clockInTimeFormatted); // Timbratura A - Inizio
                  const dateB = formatTime(b.clockInDate, b.clockOutTimeFormatted); // Timbratura B - Fine (o Inizio fittizio se 'In corso')
                  
                  // Se la data non è valida per qualche motivo, usa il fallback per il nome
                  if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                       if (a.clockInDate !== b.clockInDate) return a.clockInDate.localeCompare(b.clockInDate);
                       return a.employeeName.localeCompare(b.employeeName);
                  }
                  
                  if (dateA < dateB) return -1;
                  if (dateA > dateB) return 1;
                  return a.employeeName.localeCompare(b.employeeName);
              });

            setReports(reportData);
            setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`);
            const updatedAreas = allWorkAreas.map(area => ({ ...area, totalHours: (areaHoursMap.get(area.id) || 0).toFixed(2) }));
            setWorkAreasWithHours(updatedAreas);
            
            // CORREZIONE CHIAVE: Cambia la vista per mostrare i risultati e i pulsanti di esportazione
            if(reportData.length > 0) setView('reports'); 
            
        } catch (error) { 
            const displayMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : error.message;
            showNotification(`Errore generazione report: ${displayMessage || 'Errore Server.'}`, 'error'); 
            console.error(error); 
        }
        finally {
            if (isMounted) setIsLoading(false);
        }
        
        return () => {
             isMounted = false; 
        };

    }, [dateRange, reportAreaFilter, reportEmployeeFilter, allEmployees, allWorkAreas, showNotification]);

    const handleExportXml = useCallback((dataToExport) => {
        if (!dataToExport || dataToExport.length === 0) return showNotification("Nessun dato da esportare.", 'info'); 
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<ReportTimbrature>\n';
        dataToExport.forEach(entry => {
            xmlString += `  <Timbratura>\n`;
            xmlString += `    <Dipendente><![CDATA[${entry.employeeName || ''}]]></Dipendente>\n`;
            xmlString += `    <Area><![CDATA[${entry.areaName || ''}]]></Area>\n`;
            xmlString += `    <Data>${entry.clockInDate || ''}</Data>\n`;
            xmlString += `    <Entrata>${entry.clockInTimeFormatted}</Entrata>\n`; 
            xmlString += `    <Uscita>${entry.clockOutTimeFormatted}</Uscita>\n`; 
            xmlString += `    <OreNetto>${entry.duration ? entry.duration.toFixed(2) : 'N/A'}</OreNetto>\n`;
            xmlString += `    <PausaTotaleOre>${entry.pauseHours ? entry.pauseHours.toFixed(2) : '0.00'}</PausaTotaleOre>\n`; 
            xmlString += `    <MotivoNota><![CDATA[${entry.note || ''}]]></MotivoNota>\n`; 
            xmlString += `  </Timbratura>\n`;
        });
        xmlString += '</ReportTimbrature>';
        try {
            const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
            saveAs(blob, `${(reportTitle || 'Report').replace(/ /g, '_')}.xml`); 
            showNotification(`File XML '${(reportTitle || 'Report').replace(/ /g, '_')}.xml' generato con successo.`, 'success');
        } catch (error) { showNotification("Errore salvataggio XML.", 'error'); console.error(error); } 
    }, [reportTitle, showNotification]);
    
    const requestSort = useCallback((key) => {
        let direction = 'ascending';
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);
    

    // --- RENDER ---
    if (isLoading || !user || !userData) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento...</p></div>;
    }
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') {
       return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Accesso non autorizzato.</p></div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 w-full">
            {/* INCLUSIONE POPUP NOTIFICA */}
            {notification && <NotificationPopup message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Header */}
            <header className="bg-white shadow-md">
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                     <CompanyLogo />
                     {adminEmployeeProfile && (
                         <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 text-center">
                             {adminActiveEntry ? (
                                 <div className="space-y-2">
                                     <div>
                                         <p className="text-sm font-semibold text-green-600">Sei al lavoro</p>
                                         {adminActiveEntry.isOnBreak && <p className="text-xs font-semibold text-yellow-600">In Pausa</p>}
                                     </div>
                                     <div className="flex gap-2 justify-center">
                                         <button onClick={handleAdminPause} 
                                            disabled={isActionLoading || (!adminActiveEntry.isOnBreak && adminActiveEntry.hasCompletedPause)} 
                                            className={`text-xs px-3 py-1 text-white rounded ${adminActiveEntry.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} disabled:opacity-50`}
                                         >
                                             {adminActiveEntry.isOnBreak ? 'Termina Pausa' : 'Inizia Pausa'}
                                         </button>
                                         <button onClick={() => openModal('manualClockOut', adminEmployeeProfile)} disabled={adminActiveEntry.isOnBreak || isActionLoading} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:opacity-50">
                                             Timbra Uscita
                                         </button>
                                     </div>
                                 </div>
                             ) : (
                                 <div>
                                     <p className="text-sm font-semibold text-red-600">Non sei al lavoro</p>
                                     <button onClick={() => openModal('manualClockIn', adminEmployeeProfile)} disabled={isActionLoading} className="mt-1 text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">Timbra Entrata</button>
                                 </div>
                             )}
                         </div>
                     )}
                     <div className="flex items-center space-x-4">
                         <span className="text-sm text-gray-600 text-right">
                             {currentUserRole === 'admin' ? 'Admin' : 'Preposto'}:<br/>
                             <span className="font-medium">{userData?.name && userData?.surname ? `${userData.name} ${userData.surname}` : user?.email}</span>
                         </span>
                         <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">Logout</button>
                     </div>
                 </div>
            </header>

            {/* Navigazione */}
            <nav className="bg-white border-b border-gray-200">
                 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                     <div className="flex justify-center">
                         <div className="flex flex-wrap justify-center py-2 sm:space-x-4">
                             <button onClick={() => setView('dashboard')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Dashboard</button>
                             <button onClick={() => setView('employees')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'employees' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Dipendenti</button>
                             <button onClick={() => setView('areas')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'areas' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Aree</button>
                             {currentUserRole === 'admin' && <button onClick={() => setView('admins')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>}
                         </div>
                     </div>
                 </div>
            </nav>

            {/* Contenuto principale */}
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                {/* Form Genera Report (DEVE SEMPRE APRIRE LA VISTA REPORT QUANDO GENERATO)*/}
                <div className="bg-white shadow-md rounded-lg p-4 mb-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                        <div className="lg:col-span-1"><label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Da:</label><input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" /></div>
                        <div className="lg:col-span-1"><label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">A:</label><input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" /></div>
                        <div className="lg:col-span-1"><label htmlFor="areaFilter" className="block text-sm font-medium text-gray-700 mb-1">Area:</label><select id="areaFilter" value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white"><option value="all">Tutte le Aree</option>{(currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))).sort((a,b) => a.name.localeCompare(b.name)).map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                        <div className="lg:col-span-1"><label htmlFor="employeeFilter" className="block text-sm font-medium text-gray-700 mb-1">Dipendente:</label><select id="employeeFilter" value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white"><option value="all">Tutti i Dipendenti</option>{(currentUserRole === 'admin' ? allEmployees : managedEmployees).sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}</select></div>
                        <div className="lg:col-span-1"><button onClick={generateReport} disabled={isLoading || isActionLoading} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm w-full disabled:opacity-50">Genera Report</button></div>
                    </div>
                </div>

                {/* Render della vista corrente */}
                <main>
                    {view === 'dashboard' && <DashboardView totalEmployees={managedEmployees.length} activeEmployeesDetails={activeEmployeesDetails} totalDayHours={totalDayHours} />}
                    
                    {view === 'employees' && <EmployeeManagementView 
                        employees={sortedAndFilteredEmployees} 
                        openModal={openModal} 
                        currentUserRole={currentUserRole} 
                        requestSort={requestSort} 
                        sortConfig={sortConfig} 
                        searchTerm={searchTerm} 
                        setSearchTerm={setSearchTerm} 
                        handleResetEmployeeDevice={handleResetEmployeeDevice} 
                        adminEmployeeId={adminEmployeeProfile?.id}
                        handleEmployeePauseClick={handleEmployeePauseClick} 
                    />}
                    
                    {view === 'areas' && <AreaManagementView workAreas={workAreasWithHours} openModal={openModal} currentUserRole={currentUserRole} />}
                    
                    {view === 'admins' && currentUserRole === 'admin' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} onDataUpdate={fetchData} />}
                    
                    {/* eslint-disable-next-line react/jsx-no-undef */}
                    {view === 'reports' && <ReportView 
                         reports={reports} 
                         title={reportTitle} 
                         handleExportXml={handleExportXml} 
                         dateRange={dateRange}
                         allWorkAreas={allWorkAreas}
                         allEmployees={allEmployees}
                         currentUserRole={currentUserRole}
                         userData={userData}
                         setDateRange={setDateRange}
                         setReportAreaFilter={setReportAreaFilter}
                         reportAreaFilter={reportAreaFilter}
                         reportEmployeeFilter={reportEmployeeFilter}
                         setReportEmployeeFilter={setReportEmployeeFilter}
                         generateReport={generateReport}
                         isLoading={isLoading}
                         isActionLoading={isActionLoading}
                         managedEmployees={managedEmployees}
                         showNotification={showNotification}
                    />}
                </main>
            </div>
            
            {/* Avviso di Copyright */}
            <footer className="w-full bg-white border-t border-gray-200 py-3 mt-8">
                <p className="text-center text-xs text-gray-500">
                     &copy; {new Date().getFullYear()} TCS Italia S.r.l. Tutti i diritti riservati.
                </p>
            </footer>


            {/* Modale */}
            {showModal && (
                 <AdminModal
                     type={modalType}
                     item={selectedItem}
                     setShowModal={setShowModal}
                     workAreas={allWorkAreas}
                     onDataUpdate={fetchData}
                     user={user}
                     superAdminEmail={superAdminEmail}
                     allEmployees={allEmployees}
                     currentUserRole={currentUserRole}
                     userData={userData} 
                     onAdminClockIn={handleAdminClockIn}
                 />
             )}
        </div>
    );
};

export default AdminDashboard;