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
                                                <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap">Assegna Aree (Tutte)</button>
                                                <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                <button onClick={() => handleGenerateEmployeeReportPDF(emp)} className="text-xs text-purple-600 hover:text-purple-900">PDF Report</button>
                                            </div>
                                        )}

                                        {/* Pulsante Visibile SOLO al Preposto */}
                                        {currentUserRole === 'preposto' && (
                                             <div className="flex gap-2 w-full justify-start mt-1">
                                                <button onClick={() => openModal('assignEmployeeToPrepostoArea', emp)} className="text-xs text-blue-600 hover:text-blue-900 whitespace-nowrap">Assegna alle Mie Aree</button>
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

const ReportView = ({ reports, title, handleExportXml }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
            <div className="flex items-center space-x-2">
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
                    ws['!cols'] = [
                        { wch: Math.max(20, ...dataToExport.map(r => r['Dipendente']?.length || 0)) }, 
                        { wch: Math.max(15, ...dataToExport.map(r => r['Area']?.length || 0)) },       
                        { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 30 } 
                    ];
                    writeFile(wb, `${(title || 'Report').replace(/ /g, '_')}.xlsx`);
                }} disabled={!reports || reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
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
    // ... (stati come prima) ...
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
    const [isLoading, setIsLoading] = useState(true); // Parte come true
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
    const superAdminEmail = "domenico.leoncino@tcsitalia.com";

    // --- 
    // --- BLOCCO PATCH TEMPORANEO (CON FUNZIONE COMMENTATA) ---
    // ---
    useEffect(() => {
        /* // La funzione è commentata perché la patch è già stata applicata
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
                    // ... (gestione errori patch) ...
                }
            }
        };
        */ // Fine commento funzione fixClaim

        // --- ISTRUZIONI PER LA PATCH (ESEGUITA) ---
        // 1. Assicurati che la Cloud Function 'TEMP_fixMyClaim' sia deployata.
        // 2. Fai Login nell'app con l'email 'superAdminEmail'.
        // 3. Togli il commento (//) dalla riga 'fixClaim();' qui sotto.
        // 4. Salva questo file. L'app si ricaricherà.
        // 5. Dovresti vedere un alert "PATCH APPLICATA!". Clicca OK.
        // 6. RIMETTI SUBITO IL COMMENTO (//) alla riga 'fixClaim();'.
        // 7. Salva di nuovo il file.
        // 8. Fai Logout e poi Login nell'app. I permessi admin saranno attivi.
        
        // --- CHIAMATA COMMENTATA (CORRETTO) ---
        // fixClaim(); 
        // ---------------------------------------------

    }, [user]); // Si attiva quando 'user' viene caricato
    // --- FINE BLOCCO PATCH ---


    const fetchData = useCallback(async () => {
        if (!user || !userData) { 
            console.log("Utente o dati utente non ancora disponibili per fetchData.");
            setIsLoading(false); 
            return; 
        }
        const role = userData?.role;
        if (role !== 'admin' && role !== 'preposto') {
            console.log("Ruolo non autorizzato per accedere alla dashboard:", role);
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
            setWorkAreasWithHours(allAreasList.map(a => ({...a, totalHours: 'N/D'})));

            const allEmployeesSnapshot = await getDocs(collection(db, "employees"));
            const allEmployeesList = allEmployeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log("Dipendenti caricati:", allEmployeesList.length);
            setAllEmployees(allEmployeesList);

            if (role === 'preposto' || (role === 'admin' && user.email !== superAdminEmail)) {
                 const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                 const adminEmployeeSnapshot = await getDocs(q);
                 if (!adminEmployeeSnapshot.empty) {
                     const adminProfile = { id: adminEmployeeSnapshot.docs[0].id, ...adminEmployeeSnapshot.docs[0].data() };
                     console.log("Profilo dipendente per admin/preposto trovato:", adminProfile.id);
                     setAdminEmployeeProfile(adminProfile);
                 } else {
                     console.log("Nessun profilo dipendente trovato per admin/preposto:", user.uid);
                     setAdminEmployeeProfile(null); 
                 }
            } else {
                setAdminEmployeeProfile(null); 
            }

            if (role === 'admin') {
                const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
                const adminsSnapshot = await getDocs(qAdmins);
                const adminUsers = adminsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                    return { id: doc.id, ...data, managedAreaNames };
                });
                console.log("Admin/Preposti caricati:", adminUsers.length);
                setAdmins(adminUsers);
            } else {
                setAdmins([]); 
            }
            
        } catch (error) {
            console.error("Errore grave nel caricamento dei dati statici: ", error);
            alert("Errore nel caricamento dei dati iniziali. Controlla la console.");
        } finally {
            setIsLoading(false);
            console.log("fetchData completato.");
        }
    }, [user, userData, superAdminEmail]); 

    useEffect(() => {
        if (user && userData) { 
            fetchData();
        } else {
             console.log("In attesa di user e userData per eseguire fetchData...");
        }
    }, [user, userData, fetchData]); 

    const managedEmployees = useMemo(() => {
        if (currentUserRole !== 'preposto' || !userData?.managedAreaIds) {
            if (currentUserRole === 'admin') return allEmployees;
            return []; 
        }
        const managedAreaIds = userData.managedAreaIds;
        const filtered = allEmployees.filter(emp =>
            emp.workAreaIds && emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId))
        );
        console.log(`Preposto (${user?.email}) gestisce ${managedAreaIds.length} aree, visualizza ${filtered.length} dipendenti.`);
        return filtered;
    }, [allEmployees, currentUserRole, userData, user]);

    useEffect(() => {
        if (!allEmployees.length || !allWorkAreas.length) {
            console.log("Listener timbrature attive in attesa di employees/workAreas.");
            setActiveEmployeesDetails([]); // Svuota se i dati base non ci sono
            return;
        }
        console.log("Avvio listener timbrature attive...");

        const q = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log("Listener timbrature attive: ricevuto snapshot con", snapshot.docs.length, "documenti.");
            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (adminEmployeeProfile) {
                const adminActiveEntryData = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                if (adminActiveEntryData) {
                    const isOnBreak = adminActiveEntryData.pauses?.some(p => !p.end) || false;
                    setAdminActiveEntry({ ...adminActiveEntryData, id: adminActiveEntryData.id, isOnBreak });
                } else {
                    setAdminActiveEntry(null);
                }
            }
            
            const details = activeEntriesList
                .filter(entry => entry.clockInTime) 
                .map(entry => {
                    const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                    const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                    // Se employee o area non esistono più, mostra info limitate o scarta? Per ora mostriamo 'Sconosciuto'
                    const isOnBreak = entry.pauses?.some(p => !p.end) || false;
                    const roundedDate = roundTimeWithCustomRules(entry.clockInTime.toDate(), 'entrata');
                    return {
                        id: entry.id,
                        employeeId: entry.employeeId,
                        employeeName: employee ? `${employee.name} ${employee.surname}` : 'Dipendente Sconosciuto',
                        areaName: area ? area.name : 'Area Sconosciuta',
                        workAreaId: entry.workAreaId,
                        clockInTimeFormatted: roundedDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                        status: isOnBreak ? 'In Pausa' : 'Al Lavoro',
                        pauses: entry.pauses || [] 
                    };
                }).sort((a, b) => a.employeeName.localeCompare(b.employeeName)); 
            
            setActiveEmployeesDetails(details);
            console.log("Dettagli dipendenti attivi aggiornati:", details.length);

        }, (error) => { 
             console.error("Errore nel listener timbrature attive:", error);
             alert("Errore nell'aggiornamento in tempo reale delle presenze.");
        });

        return () => {
            console.log("Stop listener timbrature attive.");
            unsubscribe();
        };
    }, [allEmployees, allWorkAreas, adminEmployeeProfile]); 
    
    useEffect(() => {
        console.log("Avvio listener ore totali oggi...");
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            console.log("Listener ore oggi: ricevuto snapshot con", snapshot.docs.length, "documenti.");
            let totalMinutes = 0;
            const now = new Date(); 

            snapshot.docs.forEach(doc => {
                const entry = doc.data();
                if (!entry.clockInTime) return; 

                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime 
                               ? entry.clockOutTime.toDate() 
                               : (entry.status === 'clocked-in' ? now : clockIn);

                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    if (p.start && p.end) {
                        const startMillis = p.start.toMillis ? p.start.toMillis() : new Date(p.start).getTime();
                        const endMillis = p.end.toMillis ? p.end.toMillis() : new Date(p.end).getTime();
                        // Aggiungi controllo validità date pausa
                        if (!isNaN(startMillis) && !isNaN(endMillis) && endMillis >= startMillis) {
                           return acc + (endMillis - startMillis);
                        }
                    }
                    return acc;
                }, 0);

                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;

                if (durationMs > 0) {
                    totalMinutes += (durationMs / 60000); 
                }
            });

            setTotalDayHours((totalMinutes / 60).toFixed(2));
            console.log("Ore totali oggi aggiornate:", (totalMinutes / 60).toFixed(2));

        }, (error) => { 
            console.error("Errore nel listener ore totali oggi:", error);
            alert("Errore nell'aggiornamento delle ore totali.");
        });

        return () => {
             console.log("Stop listener ore totali oggi.");
             unsubscribe();
        };
    }, []); 
    
    const sortedAndFilteredEmployees = useMemo(() => {
        const employeesWithDetails = managedEmployees.map(emp => {
            const areaNames = (emp.workAreaIds || []).map(id => {
                const area = allWorkAreas.find(a => a.id === id);
                return area ? area.name : null;
            }).filter(Boolean); 
            const activeEntry = activeEmployeesDetails.find(detail => detail.employeeId === emp.id);
            return {
                ...emp,
                workAreaNames: areaNames, 
                activeEntry: activeEntry || null, 
            };
        });

        let filterableItems = [...employeesWithDetails];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filterableItems = filterableItems.filter(emp =>
                `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter) ||
                (emp.email && emp.email.toLowerCase().includes(lowercasedFilter)) // Aggiungi ricerca per email
            );
        }

        if (sortConfig.key) {
             filterableItems.sort((a, b) => {
                 let aValue = a[sortConfig.key];
                 let bValue = b[sortConfig.key];
                 if (sortConfig.key === 'name') {
                      aValue = `${a.name} ${a.surname}`;
                      bValue = `${b.name} ${b.surname}`;
                 }
                 // Gestisci valori null o undefined
                 if (aValue == null && bValue == null) return 0;
                 if (aValue == null) return sortConfig.direction === 'ascending' ? -1 : 1;
                 if (bValue == null) return sortConfig.direction === 'ascending' ? 1 : -1;
                 
                 // Confronto standard (localeCompare per stringhe)
                 if (typeof aValue === 'string') {
                     return aValue.localeCompare(bValue) * (sortConfig.direction === 'ascending' ? 1 : -1);
                 } else {
                    if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                    if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                 }
                 return 0;
             });
        }

        return filterableItems;
    }, [managedEmployees, activeEmployeesDetails, searchTerm, allWorkAreas, sortConfig]);

    // --- Funzioni Gestione Timbrature/Pause Admin/Preposto (invariate) ---
    const handleAdminClockIn = useCallback(async (areaId, timestamp) => { // useCallback
        if (!adminEmployeeProfile) { /* ... */ return; }
        // ... (logica invariata) ...
        try {
            await addDoc(collection(db, "time_entries"), {
                employeeId: adminEmployeeProfile.id, 
                workAreaId: areaId,
                clockInTime: Timestamp.fromDate(roundTimeWithCustomRules(new Date(timestamp), 'entrata')),
                clockOutTime: null, status: 'clocked-in', createdBy: user.uid, pauses: []
            });
            alert('Timbratura di entrata registrata.');
        } catch (error) { /* ... */ }
    }, [adminEmployeeProfile, user]); // Dipendenze per useCallback

    const handleAdminClockOut = useCallback(async () => { // useCallback
        if (!adminActiveEntry) { /* ... */ return; }
        // ... (logica invariata) ...
        try {
            await updateDoc(doc(db, "time_entries", adminActiveEntry.id), {
                clockOutTime: Timestamp.fromDate(roundTimeWithCustomRules(new Date(), 'uscita')),
                status: 'clocked-out', lastModifiedBy: user.uid
            });
        } catch (error) { /* ... */ }
    }, [adminActiveEntry, user]); // Dipendenze per useCallback

    const handleAdminPause = useCallback(async () => { // useCallback
        if (!adminActiveEntry) { /* ... */ return; }
        // ... (logica invariata) ...
        try {
            const entryRef = doc(db, "time_entries", adminActiveEntry.id);
            const entryDoc = await getDoc(entryRef);
            if (!entryDoc.exists()) throw new Error("Documento timbratura non trovato.");
            const currentPauses = entryDoc.data().pauses || [];
            const now = Timestamp.now(); 
            const activePauseIndex = currentPauses.findIndex(p => !p.end);
            if (activePauseIndex !== -1) {
                currentPauses[activePauseIndex].end = now;
            } else {
                currentPauses.push({ start: now, end: null });
            }
            await updateDoc(entryRef, { pauses: currentPauses });
        } catch (error) { /* ... */ }
    }, [adminActiveEntry]); // Dipendenze per useCallback

    const handleAdminApplyPause = useCallback(async (employee) => { // useCallback
        if (!employee || !employee.activeEntry) { /* ... */ return; }
        const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration <= 0) { /* ... */ return; }
        const pauseDurationInMinutes = workArea.pauseDuration;
        if (!window.confirm(`Applicare una pausa di ${pauseDurationInMinutes} minuti a ${employee.name} ${employee.surname}?`)) return;
        // Rimosso setIsLoading qui, gestito dentro handleSubmit del modal
        try {
            const entryRef = doc(db, "time_entries", employee.activeEntry.id);
            const entryDoc = await getDoc(entryRef);
            if (!entryDoc.exists()) throw new Error("Documento timbratura non trovato.");
            const currentPauses = entryDoc.data().pauses || [];
            const startTime = new Date(); 
            const endTime = new Date(startTime.getTime() + pauseDurationInMinutes * 60000); 
            const newPause = { 
                start: Timestamp.fromDate(startTime), end: Timestamp.fromDate(endTime),
                durationMinutes: pauseDurationInMinutes, createdBy: user.uid 
            };
            await updateDoc(entryRef, { pauses: [...currentPauses, newPause] });
            alert(`Pausa di ${pauseDurationInMinutes} minuti applicata con successo.`);
        } catch (error) { 
            console.error("Errore durante l'applicazione della pausa predefinita:", error);
            alert(`Si è verificato un errore: ${error.message}`);
        } finally {
             // Non chiudiamo il modal qui, lo fa handleSubmit in AdminModal
        }
    }, [allWorkAreas, user]); // Dipendenze per useCallback
    
    // --- Funzioni Apertura Modal, Generazione Report, Export, PDF (invariate) ---
    const openModal = (type, item = null) => { /* ... (invariata) ... */ 
        console.log("Apro modal:", type, "per item:", item?.id || 'nuovo');
        setModalType(type);
        setSelectedItem(item); 
        setShowModal(true);
    };
    const generateReport = async () => { /* ... (invariata) ... */ 
        if (!dateRange.start || !dateRange.end) { /* ... */ return; }
        setIsLoading(true);
        console.log("Genero report...", dateRange, reportAreaFilter, reportEmployeeFilter);
        try {
            // ... (logica query e filtri invariata) ...
             const startDate = new Date(dateRange.start); startDate.setHours(0, 0, 0, 0); 
             const endDate = new Date(dateRange.end); endDate.setHours(23, 59, 59, 999); 
             let q = query(collection(db, "time_entries"), 
                 where("clockInTime", ">=", Timestamp.fromDate(startDate)),
                 where("clockInTime", "<=", Timestamp.fromDate(endDate))
             );
             const querySnapshot = await getDocs(q);
             const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
             let finalEntries = entries;
             if (currentUserRole === 'preposto') { /* ... filtro preposto ... */ }
             if (reportEmployeeFilter !== 'all') { /* ... filtro dipendente ... */ }
             if (reportAreaFilter !== 'all') { /* ... filtro area ... */ }

             // ... (calcolo ore per area e preparazione reportData invariati) ...
             const areaHoursMap = new Map(); allWorkAreas.forEach(area => areaHoursMap.set(area.id, 0));
             const reportData = finalEntries.map(entry => { /* ... mapping dati ... */ }).filter(Boolean).sort(/* ... sort ... */);
             
             setReports(reportData);
             setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`);
             const updatedAreas = allWorkAreas.map(area => ({...area, totalHours: (areaHoursMap.get(area.id) || 0).toFixed(2) }));
             setWorkAreasWithHours(updatedAreas);
             alert("Report generato con successo!");
             setView('reports'); 
        } catch (error) { /* ... gestione errore ... */ } 
        finally { setIsLoading(false); }
    };
    const handleExportXml = (dataToExport) => { /* ... (invariata) ... */ 
         if (!dataToExport || dataToExport.length === 0) { /* ... */ return; }
         console.log("Esporto XML per", dataToExport.length, "record.");
         let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<ReportTimbrature>\n';
         dataToExport.forEach(entry => { /* ... costruisci XML ... */ });
         xmlString += '</ReportTimbrature>';
         try {
             const blob = new Blob([xmlString], { type: "application/xml;charset=utf-8" });
             saveAs(blob, `${(reportTitle || 'Report').replace(/ /g, '_')}.xml`);
         } catch (error) { /* ... gestione errore ... */ }
    };
    const handleGenerateEmployeeReportPDF = (employee) => { /* ... (invariata) ... */ 
        if (!employee) { /* ... */ return; }
        if (!reports || reports.length === 0) { /* ... */ return; }
        const employeeReports = reports.filter(r => r.employeeId === employee.id);
        if (employeeReports.length === 0) { /* ... */ return; }
        console.log(`Genero PDF per ${employee.name}...`);
        try {
            const doc = new jsPDF();
            // ... (imposta titolo, tabella, etc.) ...
            doc.autoTable({ /* ... opzioni tabella ... */ });
            const fileName = `Report_${employee.surname}_${employee.name}_${dateRange.start}_${dateRange.end}.pdf`;
            doc.save(fileName);
        } catch (error) { /* ... gestione errore ... */ }
    };
    const requestSort = (key) => { /* ... (invariata) ... */ 
        let direction = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        console.log("Cambio ordinamento:", key, direction);
        setSortConfig({ key, direction });
    };
    
    // --- Render Condizionale ---
    if (isLoading && (!user || !userData)) { // Mostra caricamento iniziale finché user/userData non ci sono
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento dati utente...</p></div>; 
    }
    if (!currentUserRole || (currentUserRole !== 'admin' && currentUserRole !== 'preposto')) { // Blocco accesso se ruolo non valido
         return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Accesso non autorizzato a questa sezione.</p></div>; 
    }

    // --- RENDER PRINCIPALE ---
    return (
        <div className="min-h-screen bg-gray-100 w-full">
            {/* Header */}
            <header className="bg-white shadow-md">
                 {/* ... (contenuto header invariato) ... */}
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <CompanyLogo />
                    {adminEmployeeProfile && ( /* ... sezione timbratura admin/preposto ... */ )}
                    <div className="flex items-center space-x-4"> {/* ... info utente e logout ... */} </div>
                </div>
            </header>
            
            {/* Navigazione */}
            <nav className="bg-white border-b border-gray-200">
                 {/* ... (contenuto nav invariato) ... */}
                 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-center">
                        <div className="flex flex-wrap justify-center py-2 sm:space-x-4">
                             {/* ... pulsanti nav ... */}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Contenuto Principale */}
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                {/* Sezione Genera Report */}
                {view !== 'reports' && (
                   <div className="bg-white shadow-md rounded-lg p-4 mb-6">
                        {/* ... (contenuto filtri report invariato) ... */}
                        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                            {/* ... input date, select area, select dipendente, pulsante genera ... */}
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
                workAreas={allWorkAreas} 
                onDataUpdate={fetchData} 
                user={user} 
                superAdminEmail={superAdminEmail} 
                allEmployees={allEmployees} 
                currentUserRole={currentUserRole} 
                userData={userData} 
                onAdminClockIn={handleAdminClockIn} 
                onAdminApplyPause={handleAdminApplyPause} 
            />}
        </div>
    );
};

export default AdminDashboard;