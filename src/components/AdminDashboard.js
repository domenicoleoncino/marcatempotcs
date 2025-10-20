import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
    doc, collection, addDoc, getDocs, query, where,
    updateDoc, Timestamp, getDoc, onSnapshot
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions'; // Già importato, ottimo
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal';
import { utils, writeFile } from 'xlsx'; 
import { saveAs } from 'file-saver'; 
import jsPDF from 'jspdf'; 
import 'jspdf-autotable'; 

// --- FUNZIONE DI ARROTONDAMENTO ---
const roundTimeWithCustomRules = (date, type) => {
    const newDate = new Date(date.getTime());
    const minutes = newDate.getMinutes();
    if (type === 'entrata') {
        if (minutes >= 46) {
            newDate.setHours(newDate.getHours() + 1);
            newDate.setMinutes(0);
        } else if (minutes >= 16) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    } else if (type === 'uscita') {
        if (minutes >= 30) {
            newDate.setMinutes(30);
        } else {
            newDate.setMinutes(0);
        }
    }
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    return newDate;
};

// --- SUB-COMPONENTI INTERNI ---
const DashboardView = ({ totalEmployees, activeEmployeesDetails, totalDayHours }) => (
    <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4">Dashboard</h1>
        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                <p className="text-sm text-gray-500">Dipendenti Attivi</p>
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
            ) : <p className="p-4 text-sm text-gray-500">Nessun dipendente è attualmente al lavoro.</p>}
        </div>
    </div>
);

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm, handleGenerateEmployeeReportPDF }) => { // Aggiunto handleGenerateEmployeeReportPDF mancante
    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return '';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
                {currentUserRole === 'admin' && <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Crea Nuovo Dipendente</button>}
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
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {employees.map(emp => (
                            <tr key={emp.id}>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{emp.name} {emp.surname}</div>
                                    <div className="text-xs text-gray-500 break-all">{emp.email}</div>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.activeEntry ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{emp.activeEntry ? 'Al Lavoro' : 'Non al Lavoro'}</span>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'N/A'}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex flex-col items-start gap-1">
                                        {/* Pulsanti timbratura manuale (visibili ad entrambi) */}
                                        {emp.activeEntry ? (
                                            <>
                                                <button onClick={() => openModal('manualClockOut', emp)} className="px-2 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600 w-full text-center">Timbra Uscita</button>
                                                <button onClick={() => openModal('applyPredefinedPause', emp)} className="px-2 py-1 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 w-full text-center mt-1">Applica Pausa</button>
                                            </>
                                        ) : (
                                            <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button>
                                        )}

                                        {/* Pulsanti Visibili SOLO all'Admin */}
                                        {currentUserRole === 'admin' && (
                                            <div className="flex flex-col sm:flex-row gap-2 w-full justify-start mt-1 items-start sm:items-center">
                                                {/* L'Admin assegna a QUALSIASI area */}
                                                <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap">Assegna Aree (Tutte)</button>
                                                <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                {/* Genera PDF spostato qui per admin */}
                                                <button onClick={() => handleGenerateEmployeeReportPDF(emp)} className="text-xs text-purple-600 hover:text-purple-900">PDF Report</button>
                                            </div>
                                        )}

                                        {/* Pulsante Visibile SOLO al Preposto */}
                                        {currentUserRole === 'preposto' && (
                                             <div className="flex gap-2 w-full justify-start mt-1">
                                                {/* Il Preposto assegna SOLO alle SUE aree */}
                                                <button onClick={() => openModal('assignEmployeeToPrepostoArea', emp)} className="text-xs text-blue-600 hover:text-blue-900 whitespace-nowrap">Assegna alle Mie Aree</button>
                                                 {/* Genera PDF anche per preposto */}
                                                <button onClick={() => handleGenerateEmployeeReportPDF(emp)} className="text-xs text-purple-600 hover:text-purple-900">PDF Report</button>
                                             </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


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
                        {/* Aggiungiamo colonne Geo solo per Admin */}
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
                            {/* Mostra Geo solo ad Admin */}
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
            // Assicurati che esista una Cloud Function chiamata 'createNewUser'
            const createNewUser = httpsCallable(functions, 'createUser'); // Usiamo createUser, la logica interna distingue i ruoli
            await createNewUser({
                ...formData,
                email: formData.email.toLowerCase().trim(),
                role: formData.role // Passiamo il ruolo selezionato
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
                            // Non mostrare il super admin ad altri admin (a meno che non sia l'utente stesso)
                            if (admin.email === superAdminEmail && user.email !== superAdminEmail) {
                                return null;
                            }
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
                                            {/* Solo Admin può assegnare aree a un Preposto */}
                                            {currentUserRole === 'admin' && admin.role === 'preposto' && <button onClick={() => openModal('assignManagedAreas', admin)} className="text-xs text-indigo-600 hover:text-indigo-900">Assegna Aree Gestite</button>}
                                            {/* Solo Admin può eliminare altri Admin/Preposti (non il super admin) */}
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

const ReportView = ({ reports, title, handleExportXml }) => ( // Tolto user non usato, tolto handleExportExcel non usato
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
            <div className="flex items-center space-x-2">
                {/* --- BLOCCO EXCEL CORRETTO --- */}
                <button onClick={() => {
                    if (typeof utils === 'undefined' || typeof writeFile === 'undefined') {
                        alert("La libreria di esportazione non è ancora stata caricata. Riprova tra un momento.");
                        return;
                    }
                    if (!reports || reports.length === 0) {
                        alert("Nessun dato da esportare.");
                        return;
                    }
                    const dataToExport = reports.map(entry => ({
                        'Dipendente': entry.employeeName,
                        'Area': entry.areaName,
                        'Data': entry.clockInDate,
                        'Entrata': entry.clockInTimeFormatted,
                        'Uscita': entry.clockOutTimeFormatted,
                        'Ore Lavorate': (entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso",
                        'Note': entry.note
                    }));
                    const ws = utils.json_to_sheet(dataToExport);
                    const wb = utils.book_new();
                    utils.book_append_sheet(wb, ws, "Report Ore");
                    // Imposta larghezza colonne
                    ws['!cols'] = [
                        { wch: Math.max(20, ...dataToExport.map(r => r['Dipendente']?.length || 0)) }, // Dipendente
                        { wch: Math.max(15, ...dataToExport.map(r => r['Area']?.length || 0)) },       // Area
                        { wch: 10 }, // Data
                        { wch: 8 },  // Entrata
                        { wch: 8 },  // Uscita
                        { wch: 12 }, // Ore Lavorate
                        { wch: 30 }  // Note
                    ];
                    writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`);
                }} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
                {/* --- FINE BLOCCO EXCEL CORRETTO --- */}
                
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
    const [isLoading, setIsLoading] = useState(true);
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
    // Assicurati che questa email sia corretta
    const superAdminEmail = "domenico.leoncino@tcsitalia.com"; 

    // --- 
    // --- BLOCCO PATCH TEMPORANEO (INTEGRATO) ---
    // ---
    useEffect(() => {
        const fixClaim = async () => {
            if (user && user.email === superAdminEmail) {
                try {
                    console.log("Applico la patch per il ruolo admin...");
                    const functions = getFunctions(undefined, 'europe-west1');
                    const fixMyClaim = httpsCallable(functions, 'TEMP_fixMyClaim');
                    const result = await fixMyClaim();
                    console.log("Risultato patch:", result.data);
                    alert("PATCH APPLICATA! Hai ottenuto i permessi di Admin. Ora fai Logout e Login per attivarli.");
                } catch (err) {
                    console.error("Errore durante l'applicazione della patch:", err);
                    if (err.code === 'functions/unauthenticated') {
                        alert("Errore patch: Non autenticato. Fai prima il login.");
                    } else if (err.code === 'functions/permission-denied') {
                         alert("Errore patch: Permesso negato. Non sei il super admin corretto o la funzione non è deployata.");
                    } else if (err.code === 'functions/not-found') {
                         alert("Errore patch: Funzione 'TEMP_fixMyClaim' non trovata. Hai fatto il deploy?");
                    } else {
                        alert("Errore patch: " + err.message);
                    }
                }
            }
        };

        // --- ISTRUZIONI PER LA PATCH (da eseguire UNA SOLA VOLTA) ---
        // 1. Assicurati che la Cloud Function 'TEMP_fixMyClaim' sia deployata.
        // 2. Fai Login nell'app con l'email 'superAdminEmail'.
        // 3. Togli il commento (//) dalla riga 'fixClaim();' qui sotto.
        // 4. Salva questo file. L'app si ricaricherà.
        // 5. Dovresti vedere un alert "PATCH APPLICATA!". Clicca OK.
        // 6. RIMETTI SUBITO IL COMMENTO (//) alla riga 'fixClaim();'.
        // 7. Salva di nuovo il file.
        // 8. Fai Logout e poi Login nell'app. I permessi admin saranno attivi.
        
        // --- DECOMMENTA QUESTA RIGA (UNA SOLA VOLTA) ---
        // fixClaim(); 
        // ---------------------------------------------

    }, [user]); // Si attiva quando 'user' viene caricato
    // --- FINE BLOCCO PATCH ---


    const fetchData = useCallback(async () => {
        // Verifica preliminare: user e userData devono esistere
        if (!user || !userData) { 
            console.log("Utente o dati utente non ancora disponibili per fetchData.");
            setIsLoading(false); 
            return; 
        }
        
        // Verifica ruolo: se l'utente non è admin o preposto, non caricare dati sensibili
        // (userData.role potrebbe non essere subito disponibile dopo il login)
        const role = userData?.role;
        if (role !== 'admin' && role !== 'preposto') {
            console.log("Ruolo non autorizzato per accedere alla dashboard:", role);
            // Potresti voler mostrare un messaggio o reindirizzare
            setIsLoading(false); 
            return;
        }

        console.log("fetchData avviato per utente:", user.email, "con ruolo:", role);
        setIsLoading(true);
        try {
            const allAreasSnapshot = await getDocs(collection(db, "work_areas"));
            const allAreasList = allAreasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("Aree caricate:", allAreasList.length);
            setAllWorkAreas(allAreasList);
            // Inizializza workAreasWithHours con i dati base, verranno aggiornati dal report
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));

            const allEmployeesSnapshot = await getDocs(collection(db, "employees"));
            const allEmployeesList = allEmployeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("Dipendenti caricati:", allEmployeesList.length);
            setAllEmployees(allEmployeesList);

            // Carica profilo "dipendente" dell'admin/preposto loggato (se esiste)
            // Questo è necessario per permettere a admin/preposto di timbrare per sé
            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) {
                 const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                 const adminEmployeeSnapshot = await getDocs(q);
                 if (!adminEmployeeSnapshot.empty) {
                     const adminProfile = { id: adminEmployeeSnapshot.docs[0].id, ...adminEmployeeSnapshot.docs[0].data() };
                     console.log("Profilo dipendente per admin/preposto trovato:", adminProfile.id);
                     setAdminEmployeeProfile(adminProfile);
                 } else {
                     console.log("Nessun profilo dipendente trovato per admin/preposto:", user.uid);
                     setAdminEmployeeProfile(null); // Assicurati sia null se non trovato
                 }
            } else {
                setAdminEmployeeProfile(null); // Il superAdmin non timbra
            }

            // Carica la lista degli altri admin/preposti (solo se l'utente è admin)
            if (role === 'admin') {
                const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
                const adminsSnapshot = await getDocs(qAdmins);
                const adminUsers = adminsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    // Calcola i nomi delle aree gestite per la visualizzazione
                    const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                    return { id: doc.id, ...data, managedAreaNames };
                });
                console.log("Admin/Preposti caricati:", adminUsers.length);
                setAdmins(adminUsers);
            } else {
                setAdmins([]); // Un preposto non vede la lista degli altri admin
            }
            
        } catch (error) {
            console.error("Errore grave nel caricamento dei dati statici: ", error);
            alert("Errore nel caricamento dei dati iniziali. Controlla la console.");
        } finally {
            setIsLoading(false);
            console.log("fetchData completato.");
        }
    // Aggiunto user.uid alle dipendenze per ricaricare se cambia utente
    }, [user, userData, superAdminEmail]); // currentUserRole rimosso perché derivato da userData

    // Esegui fetchData quando user o userData cambiano
    useEffect(() => {
        if (user && userData) { // Esegui solo se entrambi sono disponibili
            fetchData();
        } else {
             console.log("In attesa di user e userData per eseguire fetchData...");
             // Potresti voler mostrare uno stato di caricamento diverso qui
        }
    }, [user, userData, fetchData]); // Aggiunto fetchData alle dipendenze

    const managedEmployees = useMemo(() => {
        // Se non è preposto o non ha aree gestite, mostra tutti (se admin) o nessuno (caso anomalo)
        if (currentUserRole !== 'preposto' || !userData?.managedAreaIds) {
            // Un admin vede tutti
            if (currentUserRole === 'admin') return allEmployees;
            // Se non è admin né preposto con aree, non dovrebbe vedere dipendenti
            return []; 
        }
        const managedAreaIds = userData.managedAreaIds;
        // Filtra i dipendenti che hanno ALMENO una delle aree gestite dal preposto
        const filtered = allEmployees.filter(emp =>
            emp.workAreaIds && emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId))
        );
        console.log(`Preposto (${user?.email}) gestisce ${managedAreaIds.length} aree, visualizza ${filtered.length} dipendenti.`);
        return filtered;
    }, [allEmployees, currentUserRole, userData, user]);

    // Listener per le timbrature attive (per Dashboard e stato dipendenti)
    useEffect(() => {
        // Non avviare il listener se i dati base non sono caricati
        if (!allEmployees.length || !allWorkAreas.length) {
            console.log("Listener timbrature attive in attesa di employees/workAreas.");
            return;
        }
        console.log("Avvio listener timbrature attive...");

        const q = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log("Listener timbrature attive: ricevuto snapshot con", snapshot.docs.length, "documenti.");
            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Aggiorna stato timbratura per admin/preposto loggato (se ha un profilo dipendente)
            if (adminEmployeeProfile) {
                const adminActiveEntryData = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                if (adminActiveEntryData) {
                    const isOnBreak = adminActiveEntryData.pauses?.some(p => !p.end) || false;
                    setAdminActiveEntry({ ...adminActiveEntryData, id: adminActiveEntryData.id, isOnBreak });
                } else {
                    setAdminActiveEntry(null);
                }
            }
            
            // Prepara i dettagli per la dashboard (chi è al lavoro ora)
            const details = activeEntriesList
                .filter(entry => entry.clockInTime) // Assicurati che l'entrata esista
                .map(entry => {
                    const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                    const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                    // Calcola se è in pausa
                    const isOnBreak = entry.pauses?.some(p => !p.end) || false;
                    // Arrotonda l'orario di entrata per la visualizzazione
                    const roundedDate = roundTimeWithCustomRules(entry.clockInTime.toDate(), 'entrata');
                    return {
                        id: entry.id,
                        employeeId: entry.employeeId,
                        employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
                        areaName: area ? area.name : 'Sconosciuta',
                        workAreaId: entry.workAreaId,
                        clockInTimeFormatted: roundedDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                        status: isOnBreak ? 'In Pausa' : 'Al Lavoro',
                        pauses: entry.pauses || [] // Aggiunto per riferimento se necessario
                    };
                }).sort((a, b) => a.employeeName.localeCompare(b.employeeName)); // Ordina per nome
            
            setActiveEmployeesDetails(details);
            console.log("Dettagli dipendenti attivi aggiornati:", details.length);

        }, (error) => { // Gestione errori listener
             console.error("Errore nel listener timbrature attive:", error);
             alert("Errore nell'aggiornamento in tempo reale delle presenze.");
        });

        // Cleanup listener quando il componente si smonta o le dipendenze cambiano
        return () => {
            console.log("Stop listener timbrature attive.");
            unsubscribe();
        };
    // Dipende da allEmployees e allWorkAreas per mappare ID a nomi
    // Dipende da adminEmployeeProfile per aggiornare lo stato specifico dell'admin/preposto
    }, [allEmployees, allWorkAreas, adminEmployeeProfile]); 
    
    // Listener per le ore totali lavorate OGGI (per Dashboard)
    useEffect(() => {
        console.log("Avvio listener ore totali oggi...");
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        // Query per tutte le timbrature iniziate da oggi in poi
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log("Listener ore oggi: ricevuto snapshot con", snapshot.docs.length, "documenti.");
            let totalMinutes = 0;
            const now = new Date(); // Ora corrente per le timbrature ancora aperte

            snapshot.docs.forEach(doc => {
                const entry = doc.data();
                if (!entry.clockInTime) return; // Salta timbrature incomplete

                const clockIn = entry.clockInTime.toDate();
                // Se non c'è uscita, considera l'ora attuale (se è 'clocked-in') o l'ora di entrata (se anomalo)
                const clockOut = entry.clockOutTime 
                               ? entry.clockOutTime.toDate() 
                               : (entry.status === 'clocked-in' ? now : clockIn);

                // Calcola durata totale delle pause completate per questa timbratura
                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    // Considera solo le pause con inizio E fine
                    if (p.start && p.end) {
                        // Assicurati che siano Timestamp prima di chiamare toMillis()
                        const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                        const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                        return acc + (endMillis - startMillis);
                    }
                    return acc;
                }, 0);

                // Durata effettiva lavorata = (Uscita - Entrata) - Durata Pause
                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;

                // Aggiungi solo se la durata è positiva
                if (durationMs > 0) {
                    totalMinutes += (durationMs / 60000); // Converti ms in minuti
                }
            });

            // Converte minuti totali in ore con 2 decimali e aggiorna lo stato
            setTotalDayHours((totalMinutes / 60).toFixed(2));
            console.log("Ore totali oggi aggiornate:", (totalMinutes / 60).toFixed(2));

        }, (error) => { // Gestione errori listener
            console.error("Errore nel listener ore totali oggi:", error);
            alert("Errore nell'aggiornamento delle ore totali.");
        });

        // Cleanup listener
        return () => {
             console.log("Stop listener ore totali oggi.");
             unsubscribe();
        };
    }, []); // Questo effect non ha dipendenze esterne, si avvia una volta
    
    // Logica per ordinare e filtrare i dipendenti nella tabella
    const sortedAndFilteredEmployees = useMemo(() => {
        // Mappa i dipendenti (filtrati per preposto se necessario) aggiungendo dettagli utili
        const employeesWithDetails = managedEmployees.map(emp => {
            // Trova i nomi delle aree assegnate
            const areaNames = (emp.workAreaIds || []).map(id => {
                const area = allWorkAreas.find(a => a.id === id);
                return area ? area.name : null;
            }).filter(Boolean); // Rimuove eventuali null se un'area è stata cancellata
            // Trova la timbratura attiva (se esiste) per mostrare lo stato "Al Lavoro"
            const activeEntry = activeEmployeesDetails.find(detail => detail.employeeId === emp.id);
            return {
                ...emp,
                workAreaNames: areaNames, // Array di nomi area per visualizzazione
                activeEntry: activeEntry || null, // Oggetto timbratura attiva o null
            };
        });

        // Applica filtro di ricerca testuale
        let filterableItems = [...employeesWithDetails];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filterableItems = filterableItems.filter(emp =>
                // Cerca corrispondenza in nome o cognome
                `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter)
            );
        }

        // Applica ordinamento
        if (sortConfig.key) {
             filterableItems.sort((a, b) => {
                 let aValue = a[sortConfig.key];
                 let bValue = b[sortConfig.key];
                 // Gestisci ordinamento per nome completo
                 if (sortConfig.key === 'name') {
                      aValue = `${a.name} ${a.surname}`;
                      bValue = `${b.name} ${b.surname}`;
                 }
                 // Confronto standard
                 if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                 if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                 return 0;
             });
        }

        return filterableItems;
    // Dipende da questi stati/props per ricalcolare
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig]);

    // Funzione per timbrare entrata come admin/preposto
    const handleAdminClockIn = async (areaId, timestamp) => {
        if (!adminEmployeeProfile) {
             alert("Profilo dipendente non trovato per questo account.");
             return;
        }
        setIsLoading(true); // Mostra caricamento (potrebbe essere utile un loading specifico)
        try {
            // Usiamo addDoc per creare una nuova timbratura
            await addDoc(collection(db, "time_entries"), {
                employeeId: adminEmployeeProfile.id, // ID del documento 'employees'
                workAreaId: areaId,
                // Applica arrotondamento all'entrata
                clockInTime: Timestamp.fromDate(roundTimeWithCustomRules(new Date(timestamp), 'entrata')),
                clockOutTime: null,
                status: 'clocked-in',
                createdBy: user.uid, // Chi ha effettuato l'azione (l'admin/preposto loggato)
                pauses: [] // Inizia senza pause
            });
            alert('Timbratura di entrata registrata.');
        } catch (error) {
            console.error("Errore durante la timbratura di entrata admin/preposto:", error);
            alert(`Errore durante la timbratura: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    // Funzione per timbrare uscita come admin/preposto
    const handleAdminClockOut = async () => {
        if (!adminActiveEntry) {
             alert("Nessuna timbratura attiva trovata per timbrare l'uscita.");
             return;
        }
        setIsLoading(true);
        try {
            // Aggiorna la timbratura attiva esistente
            await updateDoc(doc(db, "time_entries", adminActiveEntry.id), {
                // Applica arrotondamento all'uscita
                clockOutTime: Timestamp.fromDate(roundTimeWithCustomRules(new Date(), 'uscita')),
                status: 'clocked-out',
                lastModifiedBy: user.uid // Chi ha modificato (opzionale)
            });
            // Lo stato si aggiornerà automaticamente grazie al listener
        } catch (error) {
            console.error("Errore nel timbrare l'uscita admin/preposto:", error);
            alert(`Errore durante la timbratura di uscita: ${error.message}`);
        } finally {
             setIsLoading(false);
        }
    };

    // Funzione per iniziare/terminare pausa come admin/preposto
    const handleAdminPause = async () => {
        if (!adminActiveEntry) {
             alert("Nessuna timbratura attiva per gestire la pausa.");
             return;
        }
        setIsLoading(true);
        try {
            const entryRef = doc(db, "time_entries", adminActiveEntry.id);
            // Leggiamo lo stato attuale delle pause direttamente dal DB per sicurezza
            const entryDoc = await getDoc(entryRef);
            if (!entryDoc.exists()) throw new Error("Documento timbratura non trovato.");
            
            const currentPauses = entryDoc.data().pauses || [];
            const now = Timestamp.now(); // Orario corrente

            // Verifica se c'è già una pausa attiva (senza 'end')
            const activePauseIndex = currentPauses.findIndex(p => !p.end);

            if (activePauseIndex !== -1) {
                // Termina la pausa attiva
                currentPauses[activePauseIndex].end = now;
                console.log("Termino pausa per", adminEmployeeProfile?.id);
            } else {
                // Inizia una nuova pausa
                currentPauses.push({ start: now, end: null });
                console.log("Inizio pausa per", adminEmployeeProfile?.id);
            }

            // Aggiorna l'array delle pause nel documento
            await updateDoc(entryRef, { pauses: currentPauses });
            // Lo stato si aggiornerà automaticamente grazie al listener

        } catch (error) {
            console.error("Errore nella gestione della pausa admin/preposto:", error);
            alert(`Si è verificato un errore durante la gestione della pausa: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Funzione (chiamata dal modal) per applicare pausa predefinita a un dipendente
    const handleAdminApplyPause = async (employee) => {
        // Verifica input
        if (!employee || !employee.activeEntry) {
            alert("Impossibile applicare la pausa: nessuna timbratura attiva trovata per il dipendente.");
            return;
        }
        
        // Trova l'area di lavoro della timbratura attiva
        const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
        if (!workArea) {
            alert("Area di lavoro associata alla timbratura non trovata.");
            return;
        }
        if (!workArea.pauseDuration || workArea.pauseDuration <= 0) {
            alert(`Nessuna durata di pausa (> 0) predefinita impostata per l'area "${workArea.name}".`);
            return;
        }

        const pauseDurationInMinutes = workArea.pauseDuration;
        
        // Chiedi conferma (già fatto nel modal, ma doppia sicurezza)
        if (!window.confirm(`Applicare una pausa di ${pauseDurationInMinutes} minuti a ${employee.name} ${employee.surname}?`)) return;

        setIsLoading(true);
        try {
            const entryRef = doc(db, "time_entries", employee.activeEntry.id);
            const entryDoc = await getDoc(entryRef);
            if (!entryDoc.exists()) throw new Error("Documento timbratura non trovato.");

            const currentPauses = entryDoc.data().pauses || [];
            const startTime = new Date(); // Ora di applicazione della pausa
            const endTime = new Date(startTime.getTime() + pauseDurationInMinutes * 60000); // Calcola fine pausa

            // Crea l'oggetto pausa
            const newPause = { 
                start: Timestamp.fromDate(startTime),
                end: Timestamp.fromDate(endTime),
                durationMinutes: pauseDurationInMinutes, // Salva durata per chiarezza
                createdBy: user.uid // Chi ha applicato la pausa
            };

            // Aggiungi la nuova pausa all'array e aggiorna il documento
            await updateDoc(entryRef, {
                pauses: [...currentPauses, newPause]
            });
            alert(`Pausa di ${pauseDurationInMinutes} minuti applicata con successo.`);
            // Il listener aggiornerà lo stato visivo se necessario (anche se la pausa è già finita)

        } catch (error) {
            console.error("Errore durante l'applicazione della pausa predefinita:", error);
            alert(`Si è verificato un errore: ${error.message}`);
        } finally {
            setIsLoading(false);
            setShowModal(false); // Chiudi il modal di conferma
        }
    };
    
    // Funzione generica per aprire il modal
    const openModal = (type, item = null) => {
        console.log("Apro modal:", type, "per item:", item?.id || 'nuovo');
        setModalType(type);
        setSelectedItem(item); // L'oggetto dipendente, area, ecc.
        setShowModal(true);
    };

    // Funzione per generare il report
    const generateReport = async () => {
        if (!dateRange.start || !dateRange.end) {
            alert("Seleziona un intervallo di date valido.");
            return;
        }
        setIsLoading(true);
        console.log("Genero report da", dateRange.start, "a", dateRange.end, "Filtri:", {area: reportAreaFilter, emp: reportEmployeeFilter});
        
        try {
            const startDate = new Date(dateRange.start);
            startDate.setHours(0, 0, 0, 0); // Inizio del giorno di start
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999); // Fine del giorno di end

            // Query base per le timbrature nell'intervallo di date
            let q = query(collection(db, "time_entries"), 
                where("clockInTime", ">=", Timestamp.fromDate(startDate)),
                where("clockInTime", "<=", Timestamp.fromDate(endDate))
                // Potremmo ordinare qui, ma lo facciamo dopo per flessibilità
                // orderBy("clockInTime", "asc") 
            );
            
            // Scarica tutte le timbrature corrispondenti
            const querySnapshot = await getDocs(q);
            const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("Timbrature trovate nel periodo:", entries.length);

            // Applica filtri specifici (lato client dopo aver scaricato i dati)
            let finalEntries = entries;

            // Filtro per Preposto: mostra solo timbrature dei dipendenti gestiti
            if (currentUserRole === 'preposto') {
                const managedEmployeeIds = managedEmployees.map(emp => emp.id);
                finalEntries = finalEntries.filter(entry => managedEmployeeIds.includes(entry.employeeId));
                console.log("Filtro preposto applicato:", finalEntries.length, "timbrature rimaste.");
            }
            
            // Filtro per Dipendente selezionato
            if (reportEmployeeFilter !== 'all') {
                finalEntries = finalEntries.filter(entry => entry.employeeId === reportEmployeeFilter);
                console.log("Filtro dipendente applicato:", finalEntries.length, "timbrature rimaste.");
            }
            
            // Filtro per Area selezionata
            if (reportAreaFilter !== 'all') {
                finalEntries = finalEntries.filter(entry => entry.workAreaId === reportAreaFilter);
                 console.log("Filtro area applicato:", finalEntries.length, "timbrature rimaste.");
            }

            // Calcola le ore totali PER AREA per l'aggiornamento della vista Aree
            const areaHoursMap = new Map(); // Usiamo una mappa per efficienza
            allWorkAreas.forEach(area => areaHoursMap.set(area.id, 0)); // Inizializza tutte le aree a 0 ore

            const reportData = finalEntries
             .map(entry => { // Trasforma i dati grezzi in dati leggibili per il report
                const employee = allEmployees.find(e => e.id === entry.employeeId);
                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                
                // Salta se mancano dati essenziali
                if (!entry.clockInTime || !employee || !area) {
                     console.warn("Timbratura scartata per dati mancanti:", entry.id);
                     return null;
                }

                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : null;
                
                let durationHours = null; // Durata in ore decimali
                if (clockOut) {
                    const totalMs = clockOut.getTime() - clockIn.getTime();
                    // Calcola durata pause
                    const pauseMs = (entry.pauses || []).reduce((acc, p) => {
                        if (p.start && p.end) {
                           const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                           const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                           return acc + (endMillis - startMillis);
                        }
                        return acc;
                    }, 0);
                    
                    let calculatedDurationMs = totalMs - pauseMs;
                    // Assicura che la durata non sia negativa
                    durationHours = calculatedDurationMs > 0 ? (calculatedDurationMs / 3600000) : 0; 

                    // Aggiorna le ore totali per l'area di questa timbratura
                    areaHoursMap.set(area.id, (areaHoursMap.get(area.id) || 0) + durationHours);
                }

                return {
                    id: entry.id,
                    employeeName: `${employee.name} ${employee.surname}`,
                    employeeId: entry.employeeId, // Manteniamo ID per filtro PDF
                    areaName: area.name,
                    clockInDate: clockIn.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    clockInTimeFormatted: clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOutTimeFormatted: clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso',
                    duration: durationHours, // Ore decimali o null
                    note: entry.note || '', // Note eventuali
                    createdBy: entry.createdBy || null, // Utile per marcare timbrature manuali
                };
            }).filter(Boolean) // Rimuove eventuali null
             .sort((a, b) => { // Ordina per data e poi per nome
                 const dateA = new Date(a.clockInDate.split('/').reverse().join('-') + 'T' + a.clockInTimeFormatted);
                 const dateB = new Date(b.clockInDate.split('/').reverse().join('-') + 'T' + b.clockInTimeFormatted);
                 if (dateA < dateB) return -1;
                 if (dateA > dateB) return 1;
                 return a.employeeName.localeCompare(b.employeeName);
             });

            console.log("Dati report finali pronti:", reportData.length);
            setReports(reportData);
            setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`);

            // Aggiorna lo stato delle aree con le ore calcolate
            const updatedAreas = allWorkAreas.map(area => ({
                 ...area,
                 totalHours: (areaHoursMap.get(area.id) || 0).toFixed(2) // Formatta a 2 decimali
            }));
            setWorkAreasWithHours(updatedAreas);
            console.log("Ore totali per area aggiornate.");

            alert("Report generato con successo!");
            setView('reports'); // Passa alla vista report

        } catch (error) {
            console.error("Errore durante la generazione del report:", error);
            alert("Si è verificato un errore durante la generazione del report. Controlla la console.");
        } finally {
            setIsLoading(false);
        }
    };
    
    // Funzione per esportare in XML (passata a ReportView)
    const handleExportXml = (dataToExport) => { // Riceve i dati filtrati
        if (!dataToExport || dataToExport.length === 0) {
            alert("Nessun dato da esportare in XML.");
            return;
        }
        console.log("Esporto XML per", dataToExport.length, "record.");
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<ReportTimbrature>\n';
        dataToExport.forEach(entry => {
            xmlString += '  <Timbratura>\n';
            xmlString += `    <Dipendente>${entry.employeeName || ''}</Dipendente>\n`;
            xmlString += `    <Area>${entry.areaName || ''}</Area>\n`;
            xmlString += `    <Data>${entry.clockInDate || ''}</Data>\n`;
            xmlString += `    <Entrata>${entry.clockInTimeFormatted || ''}</Entrata>\n`;
            xmlString += `    <Uscita>${entry.clockOutTimeFormatted || ''}</Uscita>\n`;
            xmlString += `    <Ore>${entry.duration ? entry.duration.toFixed(2) : 'N/A'}</Ore>\n`;
            xmlString += `    <Note>${entry.note || ''}</Note>\n`;
            xmlString += '  </Timbratura>\n';
        });
        xmlString += '</ReportTimbrature>';
        try {
            const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
            saveAs(blob, `${(reportTitle || 'Report').replace(/ /g, '_')}.xml`);
        } catch (error) {
             console.error("Errore durante salvataggio XML:", error);
             alert("Errore durante il salvataggio del file XML.");
        }
    };
    
    // Funzione per generare PDF per singolo dipendente
    const handleGenerateEmployeeReportPDF = (employee) => {
        if (!employee) {
             alert("Seleziona un dipendente valido.");
             return;
        }
        // Usa i dati del report ATTUALE (già filtrato per data/area)
        if (!reports || reports.length === 0) {
            alert("Nessun dato nel report attuale da cui estrarre il PDF. Genera prima un report.");
            return;
        }
        
        // Filtra ulteriormente i dati del report per il dipendente specifico
        const employeeReports = reports.filter(r => r.employeeId === employee.id);
        if (employeeReports.length === 0) {
            alert(`Nessuna timbratura trovata per ${employee.name} ${employee.surname} nel periodo del report attuale.`);
            return;
        }
        console.log(`Genero PDF per ${employee.name} con ${employeeReports.length} timbrature.`);

        try {
            const doc = new jsPDF();
            // Titolo
            doc.setFontSize(18);
            doc.text(`Report Timbrature per ${employee.name} ${employee.surname}`, 14, 22);
            // Sottotitolo con periodo
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Periodo: ${reportTitle.replace('Report ', '')}`, 14, 30);
            
            // Tabella
            doc.autoTable({
                startY: 40, // Posizione verticale inizio tabella
                head: [['Data', 'Area', 'Entrata', 'Uscita', 'Ore', 'Note']],
                body: employeeReports.map(entry => [
                    entry.clockInDate,
                    entry.areaName,
                    entry.clockInTimeFormatted,
                    entry.clockOutTimeFormatted,
                    entry.duration !== null ? entry.duration.toFixed(2) : 'N/A',
                    entry.note || ''
                ]),
                // Stili opzionali
                theme: 'grid',
                headStyles: { fillColor: [22, 160, 133] }, // Colore intestazione
            });

            // Nome file
            const fileName = `Report_${employee.surname}_${employee.name}_${dateRange.start}_${dateRange.end}.pdf`;
            doc.save(fileName);

        } catch (error) {
             console.error("Errore durante generazione PDF:", error);
             alert("Errore durante la creazione del file PDF.");
        }
    };

    // Funzione per gestire il cambio di ordinamento colonna
    const requestSort = (key) => {
        let direction = 'ascending';
        // Se si clicca sulla stessa colonna, inverte la direzione
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        console.log("Cambio ordinamento:", key, direction);
        setSortConfig({ key, direction });
    };
    
    // Visualizza caricamento finché i dati essenziali non ci sono
    if (isLoading || !user || !userData) { 
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento dati utente...</p></div>; 
    }

    // Se l'utente non ha ruolo admin/preposto, mostra messaggio (o reindirizza)
    if (currentUserRole !== 'admin' && currentUserRole !== 'preposto') {
         return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Accesso non autorizzato a questa sezione.</p></div>; 
    }

    // --- RENDER PRINCIPALE ---
    return (
        <div className="min-h-screen bg-gray-100 w-full">
            {/* Header */}
            <header className="bg-white shadow-md">
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <CompanyLogo />
                    {/* Sezione Timbratura Admin/Preposto (solo se hanno profilo dipendente) */}
                    {adminEmployeeProfile && (
                        <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 text-center">
                            {adminActiveEntry ? (
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-sm font-semibold text-green-600">Sei al lavoro</p>
                                        {adminActiveEntry.isOnBreak && <p className="text-xs font-semibold text-yellow-600">In Pausa</p>}
                                    </div>
                                    <div className="flex gap-2 justify-center">
                                        <button 
                                            onClick={handleAdminPause} 
                                            disabled={isLoading} // Disabilita durante caricamento
                                            className={`text-xs px-3 py-1 text-white rounded ${adminActiveEntry.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'} disabled:opacity-50`}
                                        >
                                            {adminActiveEntry.isOnBreak ? 'Termina Pausa' : 'Inizia Pausa'}
                                        </button>
                                        <button 
                                            onClick={handleAdminClockOut} 
                                            // Disabilita se in pausa o durante caricamento
                                            disabled={adminActiveEntry.isOnBreak || isLoading} 
                                            className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:opacity-50"
                                        >
                                            Timbra Uscita
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-sm font-semibold text-red-600">Non sei al lavoro</p>
                                    <button onClick={() => openModal('adminClockIn', adminEmployeeProfile)} disabled={isLoading} className="mt-1 text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">Timbra Entrata</button>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Info Utente e Logout */}
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
                            {/* Gestione Admin visibile solo all'Admin */}
                            {currentUserRole === 'admin' && <button onClick={() => setView('admins')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>}
                             {/* Pulsante per tornare alla vista report se si è lì */}
                             {view === 'reports' && <button onClick={() => setView('reports')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium border-indigo-500 text-gray-900`}>Report Visualizzato</button>}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Contenuto Principale */}
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                {/* Sezione Genera Report (visibile sempre tranne che nella vista report) */}
                {view !== 'reports' && (
                   <div className="bg-white shadow-md rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                        {/* Layout migliorato per filtri report */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                           <div className="lg:col-span-1">
                                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Da:</label>
                                <input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" />
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">A:</label>
                                <input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-2 border border-gray-300 rounded-md w-full text-sm" />
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="areaFilter" className="block text-sm font-medium text-gray-700 mb-1">Area:</label>
                                <select id="areaFilter" value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white">
                                    <option value="all">Tutte le Aree</option>
                                    {/* Mostra solo aree gestite se preposto */}
                                    {(currentUserRole === 'admin' ? allWorkAreas : allWorkAreas.filter(a => userData?.managedAreaIds?.includes(a.id)))
                                        .sort((a,b) => a.name.localeCompare(b.name))
                                        .map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}
                                </select>
                            </div>
                            <div className="lg:col-span-1">
                                <label htmlFor="employeeFilter" className="block text-sm font-medium text-gray-700 mb-1">Dipendente:</label>
                                <select id="employeeFilter" value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="p-2 border border-gray-300 rounded-md w-full text-sm bg-white">
                                    <option value="all">Tutti i Dipendenti</option>
                                    {/* Mostra solo dipendenti gestiti se preposto */}
                                    {(currentUserRole === 'admin' ? allEmployees : managedEmployees) 
                                        .sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`))
                                        .map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}
                                </select>
                            </div>
                            <div className="lg:col-span-1">
                                <button onClick={generateReport} disabled={isLoading} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm w-full disabled:opacity-50">Genera Report</button>
                            </div>
                        </div>
                   </div>
                )}
                
                {/* Contenuto specifico della vista */}
                <main>
                    {view === 'dashboard' && <DashboardView totalEmployees={allEmployees.length} activeEmployeesDetails={activeEmployeesDetails} totalDayHours={totalDayHours} />}
                    {view === 'employees' && <EmployeeManagementView employees={sortedAndFilteredEmployees} openModal={openModal} currentUserRole={currentUserRole} requestSort={requestSort} sortConfig={sortConfig} searchTerm={searchTerm} setSearchTerm={setSearchTerm} handleGenerateEmployeeReportPDF={handleGenerateEmployeeReportPDF} />}
                    {view === 'areas' && <AreaManagementView workAreas={workAreasWithHours} openModal={openModal} currentUserRole={currentUserRole} />}
                    {view === 'admins' && currentUserRole === 'admin' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} onDataUpdate={fetchData} />}
                    {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleExportXml={handleExportXml} />}
                </main>
            </div>

            {/* Modal */}
            {showModal && <AdminModal 
                type={modalType} 
                item={selectedItem} 
                setShowModal={setShowModal} 
                // Passa solo le aree pertinenti al modal se è per il preposto
                workAreas={allWorkAreas} 
                onDataUpdate={fetchData} // Ricarica i dati dopo ogni azione nel modal
                user={user} 
                superAdminEmail={superAdminEmail} 
                allEmployees={allEmployees} 
                currentUserRole={currentUserRole} 
                userData={userData} // Passiamo userData per i permessi del preposto nel modal
                onAdminClockIn={handleAdminClockIn} // Callback per timbratura entrata admin/preposto
                onAdminApplyPause={handleAdminApplyPause} // Callback per applicare pausa predefinita
            />}
        </div>
    );
};

export default AdminDashboard;