// File: src/js/components/AdminDashboard.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
     collection, getDocs, query, where,
     Timestamp, onSnapshot
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal'; // Assicurati che il percorso sia corretto
import { utils, writeFile } from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// --- FUNZIONE DI ARROTONDAMENTO (Mantenuta per riferimento, ma l'orario ora è gestito server-side) ---
/* const roundTimeWithCustomRules = (date, type) => { ... } */

// --- SUB-COMPONENTI INTERNI ---
const DashboardView = ({ totalEmployees, activeEmployeesDetails, totalDayHours }) => (
    <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4">Dashboard</h1>
        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                <p className="text-sm text-gray-500">Dipendenti Attivi</p>
                {/* Mostra solo dipendenti VISIBILI all'utente corrente */}
                <p className="text-2xl font-bold text-gray-800">{activeEmployeesDetails.length} / {totalEmployees}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                <p className="text-sm text-gray-500">Ore Lavorate Oggi (Totali)</p>
                <p className="text-2xl font-bold text-gray-800">{totalDayHours}</p>
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

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm, handleGenerateEmployeeReportPDF }) => {
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

                {/* --- NUOVO PULSANTE PER PREPOSTO (per aggiungere dipendenti esistenti alle sue aree) --- */}
                {currentUserRole === 'preposto' && (
                    <button
                        onClick={() => openModal('prepostoAddEmployeeToAreas', null)} // Nuovo tipo di modale
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 w-full sm:w-auto text-sm"
                    >
                        Aggiungi Dipendente alle Mie Aree
                    </button>
                )}
                {/* --- FINE NUOVO PULSANTE --- */}
            </div>
            <div className="mb-4">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Cerca dipendente per nome o cognome..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
                        {employees.map(emp => ( // La lista 'employees' è già filtrata correttamente da managedEmployees/sortedAndFilteredEmployees
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
                                                <button
                                                    onClick={() => openModal('manualClockOut', emp)}
                                                    disabled={emp.activeEntry.status === 'In Pausa'}
                                                    className={`px-2 py-1 text-xs text-white rounded-md w-full text-center ${
                                                        emp.activeEntry.status === 'In Pausa'
                                                        ? 'bg-gray-400 cursor-not-allowed'
                                                        : 'bg-yellow-500 hover:bg-yellow-600'
                                                    }`}
                                                >
                                                    Timbra Uscita
                                                </button>

                                                <button
                                                    onClick={() => openModal('applyPredefinedPause', emp)}
                                                    disabled={emp.activeEntry.status === 'In Pausa'}
                                                    className={`px-2 py-1 text-xs text-white rounded-md w-full text-center mt-1 ${
                                                        emp.activeEntry.status === 'In Pausa'
                                                        ? 'bg-gray-400 cursor-not-allowed'
                                                        : 'bg-orange-500 hover:bg-orange-600'
                                                    }`}
                                                >
                                                    Applica Pausa
                                                </button>
                                            </>
                                        ) : (
                                            <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button>
                                        )}
                                        {/* Pulsanti specifici per Admin */}
                                        {currentUserRole === 'admin' && (
                                            <div className="flex flex-col sm:flex-row gap-2 w-full justify-start mt-1 items-start sm:items-center">
                                                <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap">Assegna Aree (Tutte)</button>
                                                <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                <button onClick={() => handleGenerateEmployeeReportPDF(emp)} className="text-xs text-purple-600 hover:text-purple-900">PDF Report</button>
                                            </div>
                                        )}
                                        {/* Pulsanti specifici per Preposto */}
                                        {currentUserRole === 'preposto' && (
                                             <div className="flex gap-2 w-full justify-start mt-1">
                                                 {/* Questo pulsante apre il modale per modificare assegnazioni SOLO per le aree del preposto */}
                                                 <button onClick={() => openModal('assignEmployeeToPrepostoArea', emp)} className="text-xs text-blue-600 hover:text-blue-900 whitespace-nowrap">Gestisci Mie Aree</button>
                                                 <button onClick={() => handleGenerateEmployeeReportPDF(emp)} className="text-xs text-purple-600 hover:text-purple-900">PDF Report</button>
                                             </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
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

// ... (AreaManagementView, AddAdminForm, AdminManagementView, ReportView rimangono invariati) ...
const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => (
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

const AddAdminForm = ({ onCancel, onDataUpdate, user }) => {
    const [formData, setFormData] = useState({ name: '', surname: '', email: '', password: '', phone: '', role: 'preposto' });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.password || formData.password.length < 6) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const functions = getFunctions(undefined, 'europe-west1');
            const createNewUser = httpsCallable(functions, 'createUser');
            await createNewUser({
                ...formData,
                email: formData.email.toLowerCase().trim(),
                role: formData.role
            });
            await onDataUpdate();
            onCancel();
        } catch (err) {
            console.error("Errore creazione utente admin/preposto:", err);
            setError(err.message || "Si è verificato un errore.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg shadow-inner">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Aggiungi Personale Amministrativo</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <input name="name" value={formData.name} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                <input name="surname" value={formData.surname} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                <input type="password" name="password" value={formData.password} onChange={handleInputChange} placeholder="Password (min. 6)" required className="w-full p-2 border rounded" />
                <input name="phone" value={formData.phone} onChange={handleInputChange} placeholder="Telefono (opzionale)" className="w-full p-2 border rounded" />
                <select name="role" value={formData.role} onChange={handleInputChange} required className="w-full p-2 border rounded">
                    <option value="preposto">Preposto</option>
                    <option value="admin">Admin</option>
                </select>
                {error && <p className="text-sm text-red-600 col-span-full">{error}</p>}
                <div className="col-span-full flex justify-end gap-4">
                    <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Annulla</button>
                    <button type="submit" disabled={isLoading} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400">
                        {isLoading ? 'Salvataggio...' : 'Salva'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole, onDataUpdate }) => {
    const [showForm, setShowForm] = useState(false);
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Personale Amministrativo</h1>
                {currentUserRole === 'admin' &&
                    <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">
                        {showForm ? 'Annulla' : 'Aggiungi Personale'}
                    </button>
                }
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruolo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Gestite</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {admins.map(admin => {
                            if (admin.email === superAdminEmail && user.email !== superAdminEmail) return null;
                            return (
                                <tr key={admin.id}>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{admin.name} {admin.surname}</div>
                                        <div className="text-xs text-gray-500 break-all">{admin.email}</div>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${admin.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>{admin.role}</span></td>
                                    <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{admin.managedAreaNames?.join(', ') || (admin.role === 'admin' ? 'Tutte' : 'Nessuna')}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center gap-3">
                                            {currentUserRole === 'admin' && admin.role === 'preposto' && <button onClick={() => openModal('assignManagedAreas', admin)} className="text-xs text-indigo-600 hover:text-indigo-900">Assegna Aree Gestite</button>}
                                            {currentUserRole === 'admin' && admin.email !== superAdminEmail && <button onClick={() => openModal('deleteAdmin', admin)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {showForm && <AddAdminForm onCancel={() => setShowForm(false)} onDataUpdate={onDataUpdate} user={user} />}
        </div>
    );
};

const ReportView = ({ reports, title, handleExportXml }) => {
    const handleExportExcel = () => {
        if (typeof utils === 'undefined' || typeof writeFile === 'undefined') {
            alert("Libreria esportazione non caricata."); return;
        }
        if (!reports || reports.length === 0) {
            alert("Nessun dato da esportare."); return;
        }
        const dataToExport = reports.map(entry => ({
            'Dipendente': entry.employeeName, 'Area': entry.areaName, 'Data': entry.clockInDate,
            'Entrata': entry.clockInTimeFormatted, 'Uscita': entry.clockOutTimeFormatted,
            'Ore Lavorate': (entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso",
            'Note': entry.note
        }));
        const ws = utils.json_to_sheet(dataToExport);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Report Ore");
        ws['!cols'] = [
            { wch: Math.max(20, ...dataToExport.map(r => r['Dipendente']?.length || 0)) }, { wch: Math.max(15, ...dataToExport.map(r => r['Area']?.length || 0)) },
            { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 30 }
        ];
        writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`);
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportExcel} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
                    <button onClick={() => handleExportXml(reports)} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-sm">Esporta XML</button>
                </div>
            </div>
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
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
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


// --- COMPONENTE PRINCIPALE ---
const AdminDashboard = ({ user, handleLogout, userData }) => {
    const [view, setView] = useState('dashboard');
    const [allEmployees, setAllEmployees] = useState([]); // <-- Manteniamo tutti qui
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeEmployeesDetails, setActiveEmployeesDetails] = useState([]);
    const [reports, setReports] = useState([]);
    const [reportTitle, setReportTitle] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
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

    const currentUserRole = userData?.role;
    const superAdminEmail = "domenico.leoncino@tcsitalia.com"; // Considera di metterla in config o variabile d'ambiente

    // --- CARICAMENTO DATI ---
    const fetchData = useCallback(async () => {
        if (!user || !userData) { setIsLoading(false); return; }
        const role = userData?.role;
        if (role !== 'admin' && role !== 'preposto') { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const [areasSnap, empsSnap] = await Promise.all([
                getDocs(collection(db, "work_areas")),
                getDocs(collection(db, "employees")) // Carica sempre tutti i dipendenti
            ]);
            const allAreasList = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const allEmployeesList = empsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setAllWorkAreas(allAreasList);
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));
            setAllEmployees(allEmployeesList); // Salva tutti i dipendenti nello stato

            // Trova il profilo 'employees' corrispondente all'admin/preposto loggato (se esiste)
            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) {
                 const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                 const adminEmployeeSnapshot = await getDocs(q);
                 setAdminEmployeeProfile(adminEmployeeSnapshot.empty ? null : { id: adminEmployeeSnapshot.docs[0].id, ...adminEmployeeSnapshot.docs[0].data() });
            } else {
                 setAdminEmployeeProfile(null); // Super Admin non ha profilo employee
            }

            // Se admin, carica la lista di tutti gli admin/preposti
            if (role === 'admin') {
                const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
                const adminsSnapshot = await getDocs(qAdmins);
                const adminUsers = adminsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                    return { id: doc.id, ...data, managedAreaNames };
                });
                setAdmins(adminUsers);
            } else {
                setAdmins([]); // Preposto non vede la lista admin
            }
        } catch (error) {
            console.error("Errore caricamento dati statici:", error);
            alert("Errore caricamento dati iniziali. Controlla console.");
        } finally {
            setIsLoading(false);
        }
    }, [user, userData, superAdminEmail]); // Dipendenze corrette

    useEffect(() => {
        if (user && userData) fetchData();
    }, [user, userData, fetchData]); // fetchData è ora inclusa nelle dipendenze


    // --- CALCOLI MEMOIZED ---
    // === MODIFICA 1: Logica di filtraggio per preposto ===
    // Determina quali dipendenti mostrare nella tabella principale "Gestione Dipendenti"
    const managedEmployees = useMemo(() => {
        // Se l'utente è Admin, mostra tutti i dipendenti.
        if (currentUserRole === 'admin') {
            console.log("Admin - Mostro tutti i dipendenti:", allEmployees.length);
            return allEmployees;
        }
        // Se l'utente è Preposto, mostra SOLO i dipendenti assegnati ad almeno una delle sue aree gestite.
        if (currentUserRole === 'preposto' && userData?.managedAreaIds) {
            const managedAreaIds = userData.managedAreaIds;
            console.log(`Preposto - Filtro per aree: ${managedAreaIds.join(', ')}`);
            // Filtra l'intera lista di dipendenti (allEmployees)
            const filtered = allEmployees.filter(emp =>
                // Controlla se l'array workAreaIds del dipendente esiste
                emp.workAreaIds &&
                // Verifica se almeno uno degli ID in workAreaIds è presente in managedAreaIds
                emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId))
            );
            console.log("Preposto - Dipendenti filtrati:", filtered.length);
            return filtered;
        }
        // In altri casi (o se userData non è ancora pronto), non mostra nulla.
        console.log("Ruolo non riconosciuto o dati mancanti, nessun dipendente da mostrare.");
        return [];
    }, [allEmployees, currentUserRole, userData]); // Dipende da tutti i dipendenti, ruolo e dati utente (per managedAreaIds)
    // === FINE MODIFICA 1 ===


    // Ordina e filtra i dipendenti da mostrare nella tabella
    const sortedAndFilteredEmployees = useMemo(() => {
        // Prende la lista già filtrata da managedEmployees
        const employeesWithDetails = managedEmployees.map(emp => ({
            ...emp,
            workAreaNames: (emp.workAreaIds || []).map(id => allWorkAreas.find(a => a.id === id)?.name).filter(Boolean),
            activeEntry: activeEmployeesDetails.find(detail => detail.employeeId === emp.id) || null,
        }));
        let filterableItems = [...employeesWithDetails];
        // Applica il filtro di ricerca testuale
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filterableItems = filterableItems.filter(emp => `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter));
        }
        // Applica l'ordinamento
        if (sortConfig.key) {
             filterableItems.sort((a, b) => {
                 let aValue = (sortConfig.key === 'name') ? `${a.name} ${a.surname}` : a[sortConfig.key];
                 let bValue = (sortConfig.key === 'name') ? `${b.name} ${b.surname}` : b[sortConfig.key];
                 // Gestione valori null o undefined per l'ordinamento
                 if (aValue == null) aValue = ''; // Tratta null/undefined come stringa vuota
                 if (bValue == null) bValue = '';
                 // Conversione a stringa per confronto robusto
                 aValue = String(aValue);
                 bValue = String(bValue);

                 if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                 if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                 return 0;
             });
        }
        return filterableItems;
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig]); // Dipende dalla lista filtrata, stato attivo, ricerca, aree e config ordinamento


    // --- LISTENER ---
    // Listener timbrature attive
    useEffect(() => {
        // Non partire se mancano dati essenziali
        if (!allEmployees.length || !allWorkAreas.length) return;

        const q = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Aggiorna lo stato della timbratura attiva dell'admin/preposto loggato
            if (adminEmployeeProfile) {
                const adminEntry = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                setAdminActiveEntry(adminEntry ? { ...adminEntry, id: adminEntry.id, isOnBreak: adminEntry.pauses?.some(p => !p.end) || false } : null);
            }

            // Prepara i dettagli per la dashboard "Chi è al lavoro ora"
            const details = activeEntriesList
                .filter(entry => entry.clockInTime) // Assicurati che ci sia un tempo di entrata
                .map(entry => {
                    const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                    const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                    const isOnBreak = entry.pauses?.some(p => !p.end) || false; // Controlla se c'è una pausa attiva

                    // FORMATTAZIONE ORA CORRETTA (Usa Intl.DateTimeFormat)
                    let clockInFormatted = 'N/D';
                    if (entry.clockInTime && typeof entry.clockInTime.toDate === 'function') {
                        try {
                           const clockInDate = entry.clockInTime.toDate();
                           clockInFormatted = new Intl.DateTimeFormat('it-IT', {
                               hour: '2-digit',
                               minute: '2-digit',
                               timeZone: 'Europe/Rome' // Specifica il fuso orario!
                           }).format(clockInDate);
                        } catch (e) { console.error("Errore formattazione ora entrata:", e); }
                    }

                    return {
                        id: entry.id,
                        employeeId: entry.employeeId,
                        employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
                        areaName: area ? area.name : 'Sconosciuta',
                        workAreaId: entry.workAreaId,
                        clockInTimeFormatted: clockInFormatted, // Usa l'ora formattata correttamente
                        status: isOnBreak ? 'In Pausa' : 'Al Lavoro', // Mostra lo stato corretto
                        pauses: entry.pauses || []
                    };
                })
                // === MODIFICA 2: Filtra anche la dashboard se è preposto ===
                .filter(detail => {
                    if (currentUserRole === 'admin') return true; // Admin vede tutti
                    if (currentUserRole === 'preposto' && userData?.managedAreaIds) {
                        // Preposto vede solo se il dipendente è in una delle sue aree
                        const employee = allEmployees.find(emp => emp.id === detail.employeeId);
                        return employee?.workAreaIds?.some(waId => userData.managedAreaIds.includes(waId));
                    }
                    return false; // Altrimenti non mostra
                })
                .sort((a, b) => a.employeeName.localeCompare(b.employeeName)); // Ordina per nome
                // === FINE MODIFICA 2 ===

            setActiveEmployeesDetails(details);
        }, (error) => {
             console.error("Errore listener timbrature attive:", error);
             alert("Errore aggiornamento presenze.");
        });
        return () => unsubscribe(); // Pulisce il listener
    // === MODIFICA 3: Aggiunte dipendenze per il filtro preposto ===
    }, [allEmployees, allWorkAreas, adminEmployeeProfile, currentUserRole, userData]); // Dipendenze corrette
    // === FINE MODIFICA 3 ===


    // Listener ore totali oggi
    useEffect(() => {
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let totalMinutes = 0; const now = new Date();
            snapshot.docs.forEach(doc => {
                const entry = doc.data();
                if (!entry.clockInTime) return;

                // === MODIFICA 4: Filtra ore totali se preposto ===
                // Considera solo le timbrature dei dipendenti gestiti dal preposto
                if (currentUserRole === 'preposto' && userData?.managedAreaIds) {
                     const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                     if (!employee || !employee.workAreaIds?.some(waId => userData.managedAreaIds.includes(waId))) {
                         return; // Salta questa timbratura se non è di un dipendente gestito
                     }
                 }
                 // === FINE MODIFICA 4 ===

                const clockIn = entry.clockInTime.toDate();
                // Se non c'è clockOut, considera 'now' solo se lo stato è 'clocked-in'
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : (entry.status === 'clocked-in' ? now : clockIn);
                // Calcola durata pause completate
                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    if (p.start && p.end) {
                        // Gestisce sia Timestamp che Date (per compatibilità)
                        const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                        const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                        return acc + (endMillis - startMillis);
                    } return acc;
                }, 0);
                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;
                if (durationMs > 0) totalMinutes += (durationMs / 60000);
            });
            setTotalDayHours((totalMinutes / 60).toFixed(2));
        }, (error) => {
            console.error("Errore listener ore totali:", error);
            alert("Errore aggiornamento ore totali.");
        });
        return () => unsubscribe();
    // === MODIFICA 5: Aggiunte dipendenze per filtro preposto ===
    }, [currentUserRole, userData, allEmployees]); // Dipende da ruolo, dati utente e lista dipendenti
    // === FINE MODIFICA 5 ===


    // --- FUNZIONI HANDLER ---
    // (handleAdminClockIn, handleAdminClockOut, handleAdminPause, handleAdminApplyPause rimangono invariati)
     const handleAdminClockIn = useCallback(async (areaId, timestamp) => {
         if (!adminEmployeeProfile) return alert("Profilo dipendente non trovato.");
         setIsActionLoading(true);
         try {
             // Chiama la Cloud Function manualClockIn (che ora gestisce il timezone)
             const clockInFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'manualClockIn');
             await clockInFunction({
                 employeeId: adminEmployeeProfile.id,
                 workAreaId: areaId,
                 timestamp: timestamp, // La stringa YYYY-MM-DDTHH:mm
                 timezone: 'Europe/Rome', // Specifica il timezone!
                 adminId: user.uid
             });
             alert('Timbratura entrata registrata.');
             setShowModal(false); // Chiudi modal dopo successo
         } catch (error) { alert(`Errore: ${error.message}`); console.error(error); }
         finally { setIsActionLoading(false); }
     }, [adminEmployeeProfile, user]); // Rimosso setShowModal

     const handleAdminClockOut = useCallback(async () => {
         if (!adminActiveEntry) return alert("Nessuna timbratura attiva trovata.");
         setIsActionLoading(true);
         try {
             // Chiama la Cloud Function manualClockOut (che ora gestisce il timezone)
             const clockOutFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'manualClockOut');
             const now = new Date();
             now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
             const currentTime = now.toISOString().slice(0, 16); // Formato YYYY-MM-DDTHH:mm
             await clockOutFunction({
                 employeeId: adminEmployeeProfile.id,
                 timestamp: currentTime, // Usa l'ora attuale formattata
                 timezone: 'Europe/Rome', // Specifica il timezone!
                 adminId: user.uid
             });
             alert('Timbratura uscita registrata.');
         } catch (error) { alert(`Errore: ${error.message}`); console.error(error); }
         finally { setIsActionLoading(false); }
     }, [adminActiveEntry, user, adminEmployeeProfile]); // Aggiunto adminEmployeeProfile

     const handleAdminPause = useCallback(async () => {
         if (!adminActiveEntry) return alert("Nessuna timbratura attiva.");
         setIsActionLoading(true);
         try {
             // Chiama la Cloud Function prepostoTogglePause (non serve timezone, usa server time)
             const togglePauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'prepostoTogglePause');
             await togglePauseFunction();
             // L'alert viene mostrato dal listener che aggiorna adminActiveEntry
         } catch (error) { alert(`Errore pausa: ${error.message}`); console.error(error); }
         finally { setIsActionLoading(false); }
     }, [adminActiveEntry]);

     const handleAdminApplyPause = useCallback(async (employee) => {
         if (!employee || !employee.activeEntry) return alert("Nessuna timbratura attiva per questo dipendente.");
         const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
         if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) {
             return alert(`Nessuna pausa predefinita configurata per l'area "${workArea?.name || 'sconosciuta'}". Modifica l'area per aggiungerla.`);
         }
         const pauseDurationInMinutes = workArea.pauseDuration;

         setIsActionLoading(true);
         try {
             // Chiama la Cloud Function applyAutoPauseEmployee (non serve timezone, usa server time)
             const applyPauseFunction = httpsCallable(getFunctions(undefined, 'europe-west1'), 'applyAutoPauseEmployee');
             // Passa l'ID della timbratura attiva e la durata
             await applyPauseFunction({ timeEntryId: employee.activeEntry.id, durationMinutes: pauseDurationInMinutes });
             alert(`Pausa predefinita di ${pauseDurationInMinutes} minuti applicata a ${employee.name}.`);
             setShowModal(false); // Chiudi modal dopo successo
         } catch (error) { alert(`Errore applicazione pausa: ${error.message}`); console.error(error); }
         finally {
             setIsActionLoading(false);
             // Non chiudere il modal in caso di errore
         }
     }, [allWorkAreas, setShowModal]); // Rimosso user e aggiunto setShowModal


    const openModal = useCallback((type, item = null) => {
        setModalType(type);
        setSelectedItem(item);
        setShowModal(true);
    }, []); // Non servono dipendenze qui

    // Genera report filtrato
    const generateReport = useCallback(async () => {
        if (!dateRange.start || !dateRange.end) return alert("Seleziona date valide.");
        setIsLoading(true);
        try {
            const startDate = new Date(dateRange.start); startDate.setHours(0,0,0,0);
            const endDate = new Date(dateRange.end); endDate.setHours(23,59,59,999);
            // Query base per data
            let q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startDate)), where("clockInTime", "<=", Timestamp.fromDate(endDate)));
            const querySnapshot = await getDocs(q);
            let finalEntries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filtro Preposto: mostra solo timbrature di dipendenti ASSEGNATI alle sue aree
            if (currentUserRole === 'preposto' && userData?.managedAreaIds) {
                const managedAreaIds = userData.managedAreaIds;
                // Trova gli ID dei dipendenti che sono assegnati ad almeno una delle aree gestite
                const trulyManagedEmployeeIds = allEmployees
                  .filter(emp => emp.workAreaIds?.some(areaId => managedAreaIds.includes(areaId)))
                  .map(emp => emp.id);
                // Filtra le timbrature per includere solo quelle di questi dipendenti
                finalEntries = finalEntries.filter(entry => trulyManagedEmployeeIds.includes(entry.employeeId));
            }
            // Filtro per dipendente specifico (se selezionato)
            if (reportEmployeeFilter !== 'all') {
                finalEntries = finalEntries.filter(entry => entry.employeeId === reportEmployeeFilter);
            }
            // Filtro per area specifica (se selezionata)
            if (reportAreaFilter !== 'all') {
                finalEntries = finalEntries.filter(entry => entry.workAreaId === reportAreaFilter);
            }

            // Calcola ore per area e formatta i dati per il report
            const areaHoursMap = new Map(allWorkAreas.map(area => [area.id, 0]));
            const reportData = finalEntries.map(entry => {
                const employee = allEmployees.find(e => e.id === entry.employeeId);
                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                // Salta timbrature senza dati essenziali
                if (!entry.clockInTime || !employee || !area) return null;

                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : null;
                let durationHours = null;

                // FORMATTAZIONE ORA CORRETTA (Usa Intl.DateTimeFormat)
                 let clockInFormatted = 'N/D';
                 let clockOutFormatted = 'In corso';
                 try {
                     clockInFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockIn);
                     if (clockOut) {
                         clockOutFormatted = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(clockOut);
                     }
                 } catch (e) { console.error("Errore formattazione ora report:", e); }


                if (clockOut) {
                    const totalMs = clockOut.getTime() - clockIn.getTime();
                    // Calcola durata totale delle pause registrate
                    const pauseMs = (entry.pauses || []).reduce((acc, p) => {
                        if (p.start && p.end) {
                            const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                            const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                            return acc + (endMillis - startMillis);
                        } return acc;
                    }, 0);
                    let calculatedDurationMs = totalMs - pauseMs;
                    durationHours = calculatedDurationMs > 0 ? (calculatedDurationMs / 3600000) : 0; // Converti ms in ore
                    // Aggiorna le ore totali per l'area
                    areaHoursMap.set(area.id, (areaHoursMap.get(area.id) || 0) + durationHours);
                }
                return {
                    id: entry.id,
                    employeeName: `${employee.name} ${employee.surname}`,
                    employeeId: entry.employeeId,
                    areaName: area.name,
                    clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    clockInTimeFormatted: clockInFormatted, // Usa ora formattata
                    clockOutTimeFormatted: clockOutFormatted, // Usa ora formattata
                    duration: durationHours,
                    note: entry.note || '',
                    createdBy: entry.createdBy || null, // Per indicare timbrature manuali
                };
            }).filter(Boolean) // Rimuovi eventuali righe nulle
              .sort((a, b) => { // Ordina per data/ora e poi per nome
                  // Ricostruisci date complete per ordinamento corretto
                  const dateA = new Date(`${a.clockInDate.split('/').reverse().join('-')}T${a.clockInTimeFormatted}`);
                  const dateB = new Date(`${b.clockInDate.split('/').reverse().join('-')}T${b.clockInTimeFormatted}`);
                  if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                      // Fallback se le date non sono valide
                      if (a.clockInDate !== b.clockInDate) return a.clockInDate.localeCompare(b.clockInDate);
                      return a.employeeName.localeCompare(b.employeeName);
                  }
                  if (dateA < dateB) return -1;
                  if (dateA > dateB) return 1;
                  return a.employeeName.localeCompare(b.employeeName);
              });

            setReports(reportData); // Aggiorna stato report
            setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`); // Imposta titolo
            // Aggiorna lo stato delle aree con le ore calcolate
            const updatedAreas = allWorkAreas.map(area => ({ ...area, totalHours: (areaHoursMap.get(area.id) || 0).toFixed(2) }));
            setWorkAreasWithHours(updatedAreas);
            setView('reports'); // Cambia vista per mostrare il report
        } catch (error) { alert("Errore generazione report."); console.error(error); }
        finally { setIsLoading(false); } // Disattiva caricamento
    }, [dateRange, reportAreaFilter, reportEmployeeFilter, allEmployees, allWorkAreas, currentUserRole, userData]); // Dipendenze corrette


    // Esporta report in XML
    const handleExportXml = useCallback((dataToExport) => {
        if (!dataToExport || dataToExport.length === 0) return alert("Nessun dato.");
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<ReportTimbrature>\n';
        dataToExport.forEach(entry => {
            // Usa CDATA per sicurezza nei campi testo
            xmlString += `  <Timbratura>\n`;
            xmlString += `    <Dipendente><![CDATA[${entry.employeeName || ''}]]></Dipendente>\n`;
            xmlString += `    <Area><![CDATA[${entry.areaName || ''}]]></Area>\n`;
            xmlString += `    <Data>${entry.clockInDate || ''}</Data>\n`;
            xmlString += `    <Entrata>${entry.clockInTimeFormatted || ''}</Entrata>\n`;
            xmlString += `    <Uscita>${entry.clockOutTimeFormatted || ''}</Uscita>\n`;
            xmlString += `    <Ore>${entry.duration ? entry.duration.toFixed(2) : 'N/A'}</Ore>\n`;
            xmlString += `    <Note><![CDATA[${entry.note || ''}]]></Note>\n`;
            xmlString += `  </Timbratura>\n`;
        });
        xmlString += '</ReportTimbrature>';
        try {
            const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
            saveAs(blob, `${(reportTitle || 'Report').replace(/ /g, '_')}.xml`);
        } catch (error) { alert("Errore salvataggio XML."); console.error(error); }
    }, [reportTitle]); // Dipende solo dal titolo per il nome file


    // Genera PDF report per singolo dipendente
    const handleGenerateEmployeeReportPDF = useCallback((employee) => {
        if (!employee) return alert("Seleziona dipendente.");
        // Assicurati che ci siano dati nel report visualizzato
        if (!reports || reports.length === 0) return alert("Nessun dato nel report attuale. Genera prima un report.");
        // Filtra i dati per il dipendente selezionato
        const employeeReports = reports.filter(r => r.employeeId === employee.id);
        if (employeeReports.length === 0) return alert(`Nessuna timbratura per ${employee.name} ${employee.surname} trovata nel periodo del report attuale.`);

        try {
            const doc = new jsPDF();
            // Titolo e sottotitolo
            doc.setFontSize(18); doc.text(`Report Timbrature per ${employee.name} ${employee.surname}`, 14, 22);
            doc.setFontSize(11); doc.setTextColor(100); doc.text(`Periodo: ${reportTitle.replace('Report ', '')}`, 14, 30);
            // Tabella con autotable
            doc.autoTable({
                startY: 40, // Posizione inizio tabella
                head: [['Data', 'Area', 'Entrata', 'Uscita', 'Ore', 'Note']], // Intestazioni colonne
                body: employeeReports.map(entry => [ // Dati righe
                    entry.clockInDate,
                    entry.areaName,
                    entry.clockInTimeFormatted,
                    entry.clockOutTimeFormatted,
                    entry.duration !== null ? entry.duration.toFixed(2) : 'N/A',
                    entry.note || ''
                ]),
                theme: 'grid', // Stile tabella
                headStyles: { fillColor: [22, 160, 133] }, // Colore intestazione
            });
            // Salva il PDF
            doc.save(`Report_${employee.surname}_${employee.name}_${dateRange.start}_${dateRange.end}.pdf`);
        } catch (error) { alert("Errore generazione PDF."); console.error(error); }
    }, [reports, reportTitle, dateRange]); // Dipende dai dati attuali, titolo e date


    // Gestisce il click sulle intestazioni per ordinare
    const requestSort = useCallback((key) => {
        let direction = 'ascending';
        // Se si clicca sulla stessa colonna, inverte la direzione
        if (sortConfig?.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]); // Dipende dalla configurazione corrente


    // --- RENDER ---
    // Mostra caricamento finché i dati non sono pronti
    if (isLoading || !user || !userData) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento...</p></div>;
    }
    // Mostra errore se l'utente non è admin o preposto (dovrebbe essere gestito da App.js, ma per sicurezza)
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') {
       return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Accesso non autorizzato.</p></div>;
    }

    // Render principale della dashboard
    return (
        <div className="min-h-screen bg-gray-100 w-full">
            {/* Header con logo, stato timbratura (se preposto) e logout */}
            <header className="bg-white shadow-md">
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                     <CompanyLogo />
                     {/* Mostra box timbratura solo se l'utente è preposto/admin non superadmin E ha un profilo employee */}
                     {adminEmployeeProfile && (
                         <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 text-center">
                             {adminActiveEntry ? ( // Se l'utente è attualmente timbrato
                                 <div className="space-y-2">
                                     <div>
                                         <p className="text-sm font-semibold text-green-600">Sei al lavoro</p>
                                         {adminActiveEntry.isOnBreak && <p className="text-xs font-semibold text-yellow-600">In Pausa</p>}
                                     </div>
                                     <div className="flex gap-2 justify-center">
                                         {/* Pulsante Inizia/Termina Pausa */}
                                         <button onClick={handleAdminPause} disabled={isActionLoading} className={`text-xs px-3 py-1 text-white rounded ${adminActiveEntry.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} disabled:opacity-50`}>
                                             {adminActiveEntry.isOnBreak ? 'Termina Pausa' : 'Inizia Pausa'}
                                         </button>
                                         {/* Pulsante Timbra Uscita (disabilitato se in pausa) */}
                                         <button onClick={handleAdminClockOut} disabled={adminActiveEntry.isOnBreak || isActionLoading} className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:opacity-50">
                                             Timbra Uscita
                                         </button>
                                     </div>
                                 </div>
                             ) : ( // Se l'utente NON è timbrato
                                 <div>
                                     <p className="text-sm font-semibold text-red-600">Non sei al lavoro</p>
                                     {/* Pulsante Timbra Entrata (apre modale) */}
                                     <button onClick={() => openModal('adminClockIn', adminEmployeeProfile)} disabled={isActionLoading} className="mt-1 text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">Timbra Entrata</button>
                                 </div>
                             )}
                         </div>
                     )}
                     {/* Info utente e pulsante Logout */}
                     <div className="flex items-center space-x-4">
                         <span className="text-sm text-gray-600 text-right">
                             {currentUserRole === 'admin' ? 'Admin' : 'Preposto'}:<br/>
                             <span className="font-medium">{userData?.name && userData?.surname ? `${userData.name} ${userData.surname}` : user?.email}</span>
                         </span>
                         <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">Logout</button>
                     </div>
                 </div>
            </header>

            {/* Navigazione tra le viste */}
            <nav className="bg-white border-b border-gray-200">
                 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                     <div className="flex justify-center">
                         <div className="flex flex-wrap justify-center py-2 sm:space-x-4">
                             <button onClick={() => setView('dashboard')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Dashboard</button>
                             <button onClick={() => setView('employees')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'employees' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Dipendenti</button>
                             <button onClick={() => setView('areas')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'areas' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Aree</button>
                             {/* Mostra Gestione Admin solo se l'utente è admin */}
                             {currentUserRole === 'admin' && <button onClick={() => setView('admins')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>}
                             {/* Mostra tab Report solo se un report è visualizzato */}
                             {view === 'reports' && <button onClick={() => setView('reports')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium border-indigo-500 text-gray-900`}>Report Visualizzato</button>}
                         </div>
                     </div>
                 </div>
            </nav>

            {/* Contenuto principale */}
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                {/* Mostra form generazione report se non si è nella vista report */}
                {view !== 'reports' && (
                    <div className="bg-white shadow-md rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                            {/* Input Data Inizio */}
                            <div className="lg:col-span-1"><label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Da:</label><input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" /></div>
                            {/* Input Data Fine (CORRETTO) */}
                            <div className="lg:col-span-1"><label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">A:</label><input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" /></div>
                            {/* Filtro Area (mostra solo aree gestite se preposto) */}
                            <div className="lg:col-span-1"><label htmlFor="areaFilter" className="block text-sm font-medium text-gray-700 mb-1">Area:</label><select id="areaFilter" value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white"><option value="all">Tutte le Aree</option>{(currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id))).sort((a,b) => a.name.localeCompare(b.name)).map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}</select></div>
                            {/* Filtro Dipendente (mostra solo dipendenti gestiti se preposto) */}
                            {/* === MODIFICA 6: Filtra la tendina dipendenti per il preposto === */}
                            <div className="lg:col-span-1"><label htmlFor="employeeFilter" className="block text-sm font-medium text-gray-700 mb-1">Dipendente:</label><select id="employeeFilter" value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white"><option value="all">Tutti i Dipendenti</option>{(currentUserRole === 'admin' ? allEmployees : managedEmployees).sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}</select></div>
                            {/* === FINE MODIFICA 6 === */}
                            {/* Pulsante Genera Report */}
                            <div className="lg:col-span-1"><button onClick={generateReport} disabled={isLoading || isActionLoading} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm w-full disabled:opacity-50">Genera Report</button></div>
                        </div>
                    </div>
                )}

                {/* Render della vista corrente */}
                <main>
                    {/* === MODIFICA 7: Passa managedEmployees.length a DashboardView === */}
                    {view === 'dashboard' && <DashboardView totalEmployees={managedEmployees.length} activeEmployeesDetails={activeEmployeesDetails} totalDayHours={totalDayHours} />}
                    {/* === FINE MODIFICA 7 === */}
                    {view === 'employees' && <EmployeeManagementView employees={sortedAndFilteredEmployees} openModal={openModal} currentUserRole={currentUserRole} requestSort={requestSort} sortConfig={sortConfig} searchTerm={searchTerm} setSearchTerm={setSearchTerm} handleGenerateEmployeeReportPDF={handleGenerateEmployeeReportPDF} />}
                    {view === 'areas' && <AreaManagementView workAreas={workAreasWithHours} openModal={openModal} currentUserRole={currentUserRole} />}
                    {view === 'admins' && currentUserRole === 'admin' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} onDataUpdate={fetchData} />}
                    {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleExportXml={handleExportXml} />}
                </main>
            </div>

            {/* Modale (mostrato condizionalmente) */}
            {showModal && <AdminModal
                type={modalType}
                item={selectedItem}
                setShowModal={setShowModal}
                workAreas={allWorkAreas}
                onDataUpdate={fetchData} // Passa fetchData per aggiornare i dati dopo un'azione
                user={user}
                superAdminEmail={superAdminEmail}
                allEmployees={allEmployees} // <-- Passa TUTTI i dipendenti al modale
                currentUserRole={currentUserRole}
                userData={userData} // Passa i dati dell'utente loggato (serve per managedAreaIds)
                onAdminClockIn={handleAdminClockIn} // Callback per timbratura entrata preposto
                onAdminApplyPause={handleAdminApplyPause} // Callback per applica pausa
            />}
        </div>
    );
};

export default AdminDashboard;
