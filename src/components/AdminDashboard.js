import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
    doc, collection, addDoc, getDocs, query, where,
    updateDoc, deleteDoc, writeBatch, Timestamp,
    // Importazioni per la gestione delle impostazioni
    getDoc, setDoc
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import CompanyLogo from './CompanyLogo';


// --- SUB-COMPONENTI INTERNI ---

const DashboardView = ({ employees, activeEntries, workAreas }) => {
    const calculateCurrentHours = () => {
        let totalNetMinutes = 0;
        const now = new Date();
        activeEntries.forEach(entry => {
            const clockInTime = entry.clockInTime.toDate();
            let pauseDurationMs = 0;
            if (entry.pauses && entry.pauses.length > 0) {
                entry.pauses.forEach(p => {
                    const start = p.start.toDate();
                    const end = p.end ? p.end.toDate() : now;
                    pauseDurationMs += (end.getTime() - start.getTime());
                });
            }
            const durationMs = (now.getTime() - clockInTime.getTime()) - pauseDurationMs;
            if (durationMs > 0) {
                totalNetMinutes += Math.round(durationMs / 60000);
            }
        });
        if (totalNetMinutes <= 0) return '0.00';
        const hours = Math.floor(totalNetMinutes / 60);
        const minutes = totalNetMinutes % 60;
        const decimalHours = hours + (minutes / 60);
        return decimalHours.toFixed(2);
    };

    const activeEmployeesDetails = activeEntries.map(entry => {
        const employee = employees.find(emp => emp.id === entry.employeeId);
        const area = workAreas.find(ar => ar.id === entry.workAreaId);
        const isOnBreak = entry.pauses?.some(p => !p.end) || false;
        return {
            id: entry.id,
            employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
            areaName: area ? area.name : 'Sconosciuta',
            clockInTimeFormatted: entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            status: isOnBreak ? 'In Pausa' : 'Al Lavoro'
        };
    }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return (
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4">Dashboard</h1>
            <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                    <p className="text-sm text-gray-500">Dipendenti Attivi</p>
                    <p className="text-2xl font-bold text-gray-800">{activeEntries.length} / {employees.length}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-md text-center sm:text-left">
                    <p className="text-sm text-gray-500">Ore Lavorate Oggi (nette)</p>
                    <p className="text-2xl font-bold text-gray-800">{calculateCurrentHours()}</p>
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
};

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm }) => {
    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return '';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
                {(currentUserRole === 'admin' || currentUserRole === 'preposto') && <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Dipendente</button>}
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
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('name')}>
                                Nome{getSortIndicator('name')}
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('status')}>
                                Stato{getSortIndicator('status')}
                            </th>
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
                                    {emp.deviceIds && emp.deviceIds.length > 0 && <span className="text-xs text-green-600">({emp.deviceIds.length}/2 Dispositivi)</span>}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    {emp.activeEntry ? (emp.isOnBreak ? <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">In Pausa</span> : <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Al Lavoro</span>) : <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Non al Lavoro</span>}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'N/A'}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex flex-col items-start gap-1">
                                        {emp.activeEntry ? <button onClick={() => openModal('manualClockOut', emp)} className="px-2 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600 w-full text-center">Timbra Uscita</button> : <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button>}
                                        {(currentUserRole === 'admin' || currentUserRole === 'preposto') && (
                                            <>
                                                <div className="flex gap-2 w-full justify-start mt-1">
                                                    {currentUserRole === 'admin' && <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900">Aree</button>}
                                                    <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                    <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                </div>
                                                {currentUserRole === 'admin' && emp.deviceIds && emp.deviceIds.length > 0 && <button onClick={() => openModal('resetDevice', emp)} className="text-xs text-yellow-600 hover:text-yellow-900 mt-1">Resetta Disp.</button>}
                                            </>
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
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presenze</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latitudine</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Longitudine</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raggio (m)</th>
                        {currentUserRole === 'admin' && <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {workAreas.map(area => (
                        <tr key={area.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{area.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-center">{area.activeEmployeeCount}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{area.latitude}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{area.longitude}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{area.radius}</td>
                            {currentUserRole === 'admin' && <td className="px-4 py-2 whitespace-nowrap text-sm font-medium"><div className="flex items-center gap-4"><button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-900">Modifica</button><button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-900">Elimina</button></div></td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const AdminManagementView = ({ admins, openModal, user, superAdminEmail, currentUserRole }) => {
    const isSuperAdmin = user.email === superAdminEmail;

    const adminsToDisplay = admins.filter(admin => {
        if (isSuperAdmin) return admin.id !== user.uid;
        return admin.id !== user.uid && admin.email !== superAdminEmail;
    });

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Personale Amministrativo</h1>
                {currentUserRole === 'admin' && <button onClick={() => openModal('newAdmin')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Personale</button>}
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
                        {adminsToDisplay.map(admin => (
                            <tr key={admin.id}>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{admin.name} {admin.surname}</div>
                                    <div className="text-xs text-gray-500 break-all">{admin.email}</div>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${admin.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>{admin.role}</span></td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{admin.managedAreaNames?.join(', ') || (admin.role === 'admin' ? 'Tutte' : 'Nessuna')}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-3">
                                        {currentUserRole === 'admin' && admin.role === 'preposto' && <button onClick={() => openModal('assignManagedAreas', admin)} className="text-xs text-indigo-600 hover:text-indigo-900">Assegna Aree</button>}
                                        {currentUserRole === 'admin' && <button onClick={() => openModal('deleteAdmin', admin)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>}
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

const ReportView = ({ reports, title, handleExportXml }) => {
    const handleExportExcel = () => {
        if (typeof window.XLSX === 'undefined') { alert("La libreria di esportazione non è ancora stata caricata. Riprova tra un momento."); return; }
        const dataToExport = reports.map(entry => ({ 'Dipendente': entry.employeeName, 'Area': entry.areaName, 'Data': entry.clockInDate, 'Entrata': entry.clockInTimeFormatted, 'Uscita': entry.clockOutTimeFormatted, 'Ore Lavorate': (entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso", 'Note': entry.note }));
        const ws = window.XLSX.utils.json_to_sheet(dataToExport);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Report Ore");
        ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 40 }];
        window.XLSX.writeFile(wb, `${title.replace(/ /g, '_')}.xlsx`);
    };
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportExcel} disabled={reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
                    <button onClick={handleExportXml} disabled={reports.length === 0} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-sm">Esporta XML</button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                {reports.length === 0 ? <p className="p-4 text-sm text-gray-500">Nessun dato di timbratura per il periodo selezionato.</p> : (
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
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.employeeName}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.areaName}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInDate}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockInTimeFormatted}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.clockOutTimeFormatted}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.duration !== null ? entry.duration.toFixed(2) : <span className="text-blue-500 font-semibold">...</span>}</td>
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

const PauseSettingsView = () => {
    const [durataPausa, setDurataPausa] = useState('0');
    const [messaggio, setMessaggio] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchConfig = async () => {
            const configDocRef = doc(db, 'settings', 'pausaConfig');
            try {
                const docSnap = await getDoc(configDocRef);
                if (docSnap.exists()) {
                    setDurataPausa(docSnap.data().durata);
                }
            } catch (error) {
                console.error("Errore nel caricare la configurazione della pausa:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleSalvaConfig = async (e) => {
        e.preventDefault();
        setMessaggio('Salvataggio in corso...');
        const configDocRef = doc(db, 'settings', 'pausaConfig');
        try {
            await setDoc(configDocRef, { durata: durataPausa });
            setMessaggio(`Impostazione salvata con successo: Pausa da ${durataPausa} minuti.`);
        } catch (error) {
            console.error("Errore nel salvataggio:", error);
            setMessaggio("Si è verificato un errore durante il salvataggio.");
        }
    };

    if (isLoading) {
        return <p>Caricamento impostazioni...</p>;
    }

    return (
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">Impostazioni Generali</h1>
            <div className="bg-white p-6 rounded-lg shadow-md">
                <form onSubmit={handleSalvaConfig}>
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Configurazione Pausa Dipendenti</h2>
                    <p className="text-sm text-gray-600 mb-4">Seleziona la durata della pausa predefinita che i dipendenti potranno registrare. Se imposti "0 Minuti", la funzionalità di pausa sarà disabilitata.</p>
                    <div className="space-y-3">
                        <div>
                            <input type="radio" id="pausa0" name="durataPausa" value="0" checked={durataPausa === '0'} onChange={(e) => setDurataPausa(e.target.value)} />
                            <label htmlFor="pausa0" className="ml-2">Nessuna Pausa (0 Minuti)</label>
                        </div>
                        <div>
                            <input type="radio" id="pausa30" name="durataPausa" value="30" checked={durataPausa === '30'} onChange={(e) => setDurataPausa(e.target.value)} />
                            <label htmlFor="pausa30" className="ml-2">Pausa da 30 Minuti</label>
                        </div>
                        <div>
                            <input type="radio" id="pausa60" name="durataPausa" value="60" checked={durataPausa === '60'} onChange={(e) => setDurataPausa(e.target.value)} />
                            <label htmlFor="pausa60" className="ml-2">Pausa da 60 Minuti</label>
                        </div>
                    </div>
                    <div className="mt-6">
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
                            Salva Impostazioni Pausa
                        </button>
                    </div>
                </form>
                {messaggio && <p className={`mt-4 text-sm ${messaggio.includes('Errore') ? 'text-red-600' : 'text-green-700'}`}>{messaggio}</p>}
            </div>
        </div>
    );
};

const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user, allEmployees, currentUserRole, userData }) => {
    const [formData, setFormData] = useState(item || {});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleCheckboxChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.workAreaIds || item?.workAreaIds || [];
        if (checked) {
            setFormData({ ...formData, workAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, workAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    const handleManagedAreasChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.managedAreaIds || item?.managedAreaIds || [];
        if (checked) {
            setFormData({ ...formData, managedAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, managedAreaIds: currentAreas.filter(id => id !== name) });
        }
    };

    useEffect(() => {
        if (type === 'manualClockIn' || type === 'manualClockOut') {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '', note: item?.activeEntry?.note || '' });
        } else {
            setFormData(item ? { ...item } : {});
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((type === 'newEmployee' || type === 'newAdmin') && (!formData.password || formData.password.length < 6)) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        if (type === 'deleteAdmin' && item.id === user.uid) {
            setError("Non puoi eliminare te stesso.");
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            if (type === 'newEmployee' || type === 'newAdmin') {
                await user.getIdToken(true); 
                const functions = getFunctions(undefined, 'us-central1');
                const createNewUser = httpsCallable(functions, 'createNewUser');

                const newUserPayload = {
                    email: formData.email.toLowerCase().trim(),
                    password: formData.password,
                    name: formData.name,
                    surname: formData.surname,
                    phone: formData.phone || "",
                    role: type === 'newEmployee' ? 'employee' : (formData.role || 'preposto'),
                };

                if (currentUserRole === 'preposto' && type === 'newEmployee') {
                    newUserPayload.managedAreaIds = userData.managedAreaIds || [];
                    newUserPayload.managedAreaNames = userData.managedAreaNames || [];
                }

                await createNewUser(newUserPayload);

            } else {
                switch (type) {
                    case 'editEmployee':
                        await updateDoc(doc(db, "employees", item.id), { name: formData.name, surname: formData.surname, phone: formData.phone });
                        break;
                    case 'deleteEmployee':
                        await deleteDoc(doc(db, "employees", item.id));
                        break;
                    case 'newArea':
                        await addDoc(collection(db, "work_areas"), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                        break;
                    case 'editArea':
                        await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                        break;
                    case 'deleteArea':
                        const batchDeleteArea = writeBatch(db);
                        const employeesToUpdate = allEmployees.filter(emp => emp.workAreaIds?.includes(item.id));
                        employeesToUpdate.forEach(emp => {
                            const empRef = doc(db, "employees", emp.id);
                            const updatedAreaIds = emp.workAreaIds.filter(id => id !== item.id);
                            const updatedAreaNames = emp.workAreaNames.filter(name => name !== item.name);
                            batchDeleteArea.update(empRef, { workAreaIds: updatedAreaIds, workAreaNames: updatedAreaNames });
                        });
                        await batchDeleteArea.commit();
                        await deleteDoc(doc(db, "work_areas", item.id));
                        break;
                    case 'assignArea':
                        const selectedAreaNames = workAreas.filter(area => formData.workAreaIds?.includes(area.id)).map(area => area.name);
                        await updateDoc(doc(db, "employees", item.id), { workAreaIds: formData.workAreaIds || [], workAreaNames: selectedAreaNames });
                        break;
                    case 'deleteAdmin':
                        if (item.email === superAdminEmail) { throw new Error("Non puoi eliminare il Super Admin."); }
                        await deleteDoc(doc(db, "users", item.id));
                        break;
                    case 'assignManagedAreas':
                        const selectedManagedAreaNames = workAreas.filter(area => formData.managedAreaIds?.includes(area.id)).map(area => area.name);
                        await updateDoc(doc(db, "users", item.id), { managedAreaIds: formData.managedAreaIds || [], managedAreaNames: selectedManagedAreaNames });
                        break;
                    case 'manualClockIn':
                        await addDoc(collection(db, "time_entries"), { employeeId: item.id, workAreaId: formData.workAreaId, clockInTime: new Date(formData.timestamp), clockOutTime: null, status: 'clocked-in', note: formData.note || null, pauses: [] });
                        break;
                    case 'manualClockOut':
                        await updateDoc(doc(db, "time_entries", item.activeEntry.id), { clockOutTime: new Date(formData.timestamp), status: 'clocked-out', note: formData.note || item.activeEntry.note || null });
                        break;
                    case 'resetDevice':
                        await updateDoc(doc(db, "employees", item.id), { deviceIds: [] });
                        break;
                    default: break;
                }
            }

            await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            console.error("Errore nell'handleSubmit:", err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const titles = {
        newEmployee: 'Aggiungi Nuovo Dipendente',
        editEmployee: 'Modifica Dati Dipendente',
        deleteEmployee: 'Elimina Dipendente',
        newArea: 'Aggiungi Nuova Area',
        editArea: 'Modifica Area di Lavoro',
        deleteArea: 'Elimina Area di Lavoro',
        assignArea: `Assegna Aree a ${item?.name} ${item?.surname}`,
        newAdmin: 'Aggiungi Personale Amministrativo',
        deleteAdmin: 'Elimina Personale Amministrativo',
        assignManagedAreas: `Assegna Aree a Preposto ${item?.name}`,
        manualClockIn: `Timbra Entrata per ${item?.name} ${item?.surname}`,
        manualClockOut: `Timbra Uscita per ${item?.name} ${item?.surname}`,
        resetDevice: `Resetta Dispositivi di ${item?.name} ${item?.surname}`,
    };

    const renderForm = () => {
        switch (type) {
            case 'newEmployee':
            case 'newAdmin':
                return (
                    <div className="space-y-4">
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                        <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                        <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" required className="w-full p-2 border rounded" />
                        <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full p-2 border rounded" />
                        {type === 'newEmployee' && <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono (opzionale)" className="w-full p-2 border rounded" />}
                        {type === 'newAdmin' && currentUserRole === 'admin' && (
                            <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="preposto">Preposto</option>
                                <option value="admin">Admin</option>
                            </select>
                        )}
                    </div>
                );
            case 'editEmployee':
                return (
                    <div className="space-y-4">
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" required className="w-full p-2 border rounded" />
                        <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" required className="w-full p-2 border rounded" />
                        <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono" className="w-full p-2 border rounded" />
                    </div>
                );
            case 'newArea':
            case 'editArea':
                return (
                    <div className="space-y-4">
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome Area" required className="w-full p-2 border rounded" />
                        <input type="number" step="any" name="latitude" value={formData.latitude || ''} onChange={handleInputChange} placeholder="Latitudine" required className="w-full p-2 border rounded" />
                        <input type="number" step="any" name="longitude" value={formData.longitude || ''} onChange={handleInputChange} placeholder="Longitudine" required className="w-full p-2 border rounded" />
                        <input type="number" name="radius" value={formData.radius || ''} onChange={handleInputChange} placeholder="Raggio (metri)" required className="w-full p-2 border rounded" />
                    </div>
                );
            case 'assignArea':
                return (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {workAreas.map(area => (
                            <div key={area.id} className="flex items-center">
                                <input type="checkbox" id={area.id} name={area.id} checked={formData.workAreaIds?.includes(area.id) || false} onChange={handleCheckboxChange} className="h-4 w-4" />
                                <label htmlFor={area.id} className="ml-2">{area.name}</label>
                            </div>
                        ))}
                    </div>
                );
            case 'assignManagedAreas':
                return (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {workAreas.map(area => (
                            <div key={area.id} className="flex items-center">
                                <input type="checkbox" id={area.id} name={area.id} checked={formData.managedAreaIds?.includes(area.id) || false} onChange={handleManagedAreasChange} className="h-4 w-4" />
                                <label htmlFor={area.id} className="ml-2">{area.name}</label>
                            </div>
                        ))}
                    </div>
                );
            case 'manualClockIn':
            case 'manualClockOut':
                return (
                    <div className="space-y-4">
                        <input type="datetime-local" name="timestamp" value={formData.timestamp || ''} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        {type === 'manualClockIn' && (
                            <select name="workAreaId" value={formData.workAreaId || ''} onChange={handleInputChange} required className="w-full p-2 border rounded">
                                <option value="">Seleziona Area</option>
                                {item.workAreaIds.map(areaId => {
                                    const area = workAreas.find(a => a.id === areaId);
                                    return area ? <option key={area.id} value={area.id}>{area.name}</option> : null;
                                })}
                            </select>
                        )}
                        <textarea name="note" value={formData.note || ''} onChange={handleInputChange} placeholder="Note (opzionale)" className="w-full p-2 border rounded"></textarea>
                    </div>
                );
            case 'deleteEmployee': return <p>Sei sicuro di voler eliminare il dipendente <strong>{item.name} {item.surname}</strong>? L'azione è irreversibile.</p>;
            case 'deleteArea': return <p>Sei sicuro di voler eliminare l'area <strong>{item.name}</strong>? Verrà rimossa da tutti i dipendenti a cui è assegnata.</p>;
            case 'deleteAdmin': return <p>Sei sicuro di voler eliminare l'utente <strong>{item.name} {item.surname}</strong>?</p>;
            case 'resetDevice': return <p>Sei sicuro di voler resettare i dispositivi per <strong>{item.name} {item.surname}</strong>? Potrà registrare 2 nuovi dispositivi.</p>;
            default: return null;
        }
    };

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto bg-gray-600 bg-opacity-75 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 m-4 max-w-lg w-full">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">{titles[type]}</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="text-2xl">&times;</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        {renderForm()}
                    </div>
                    {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
                    <div className="flex justify-end space-x-4">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Annulla</button>
                        <button type="submit" disabled={isLoading} className={`px-4 py-2 text-white rounded-md ${type.includes('delete') ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:bg-gray-400`}>
                            {isLoading ? 'Caricamento...' : (type.includes('delete') ? 'Elimina' : 'Conferma')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- COMPONENTE PRINCIPALE ---

const AdminDashboard = ({ user, handleLogout, userData }) => {
    const [view, setView] = useState('dashboard');
    const [employees, setEmployees] = useState([]);
    const [workAreas, setWorkAreas] = useState([]);
    const [allEmployees, setAllEmployees] = useState([]);
    const [allWorkAreas, setAllWorkAreas] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [activeEntries, setActiveEntries] = useState([]);
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

    const currentUserRole = userData?.role;
    const superAdminEmail = "domenico.leoncino@tcsitalia.com";

    const fetchData = useCallback(async () => {
        if (!user || !userData) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const allAreasSnapshot = await getDocs(collection(db, "work_areas"));
            const allAreasList = allAreasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllWorkAreas(allAreasList);

            const allEmployeesSnapshot = await getDocs(collection(db, "employees"));
            const allEmployeesList = allEmployeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllEmployees(allEmployeesList);

            const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
            const adminsSnapshot = await getDocs(qAdmins);
            const adminUsers = adminsSnapshot.docs.map(doc => {
                const data = doc.data();
                const managedAreaNames = data.managedAreaIds
                    ? data.managedAreaIds.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean)
                    : [];
                return { id: doc.id, ...data, managedAreaNames };
            });
            setAdmins(adminUsers);

            let employeesToDisplay = allEmployeesList;
            let areasToDisplay = allAreasList;

            if (currentUserRole === 'preposto' && userData.managedAreaIds) {
                areasToDisplay = allAreasList.filter(area => userData.managedAreaIds.includes(area.id));
                const managedAreaIds = userData.managedAreaIds;
                employeesToDisplay = allEmployeesList.filter(emp =>
                    emp.workAreaIds && emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId))
                );
            }

            const activeEntriesSnapshot = await getDocs(query(collection(db, "time_entries"), where("status", "==", "clocked-in")));
            const activeEntriesList = activeEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const employeesWithStatus = employeesToDisplay.map(emp => {
                const activeEntry = activeEntriesList.find(entry => entry.employeeId === emp.id);
                const isOnBreak = activeEntry?.pauses?.some(p => !p.end) || false;
                return { ...emp, activeEntry, isOnBreak };
            });

            setEmployees(employeesWithStatus);

            const activeEntriesForScope = activeEntriesList.filter(entry => employeesToDisplay.some(e => e.id === entry.employeeId));
            setActiveEntries(activeEntriesForScope);

            const workAreasWithCounts = areasToDisplay.map(area => {
                const activeCount = activeEntriesForScope.filter(entry => entry.workAreaId === area.id).length;
                return { ...area, activeEmployeeCount: activeCount };
            }).sort((a, b) => a.name.localeCompare(b.name));

            setWorkAreas(workAreasWithCounts);

        } catch (error) {
            console.error("Errore nel caricamento dei dati: ", error);
        } finally {
            setIsLoading(false);
        }
    }, [user, userData, currentUserRole]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openModal = (type, item = null) => {
        setModalType(type);
        setSelectedItem(item);
        setShowModal(true);
    };

    const generateReport = async () => {
        if (!dateRange.start || !dateRange.end) {
            alert("Seleziona un intervallo di date valido.");
            return;
        }

        const startDate = new Date(dateRange.start);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        
        const formattedStartDate = startDate.toLocaleDateString('it-IT');
        const formattedEndDate = endDate.toLocaleDateString('it-IT');
        let titleParts = [];
        
        if (reportEmployeeFilter !== 'all') {
            const selectedEmployee = allEmployees.find(emp => emp.id === reportEmployeeFilter);
            if (selectedEmployee) titleParts.push(`per ${selectedEmployee.name} ${selectedEmployee.surname}`);
        }
        
        if (reportAreaFilter !== 'all') {
            const selectedArea = allWorkAreas.find(area => area.id === reportAreaFilter);
            if (selectedArea) titleParts.push(`in area "${selectedArea.name}"`);
        }
        
        const titlePrefix = titleParts.length > 0 ? `Report ${titleParts.join(' ')}` : 'Report';
        const title = `${titlePrefix} | ${formattedStartDate} - ${formattedEndDate}`;
        setReportTitle(title);
        
        const queryConstraints = [
            where("clockInTime", ">=", Timestamp.fromDate(startDate)),
            where("clockInTime", "<=", Timestamp.fromDate(endDate))
        ];
        if (reportAreaFilter !== 'all') {
            queryConstraints.push(where("workAreaId", "==", reportAreaFilter));
        }
        if (reportEmployeeFilter !== 'all') {
            queryConstraints.push(where("employeeId", "==", reportEmployeeFilter));
        }

        const q = query(collection(db, "time_entries"), ...queryConstraints);
        const querySnapshot = await getDocs(q);
        const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const reportData = [];
        for (const entry of entries) {
            const employeeData = allEmployees.find(e => e.id === entry.employeeId);
            const areaData = allWorkAreas.find(a => a.id === entry.workAreaId);

            if (employeeData && areaData) {
                const clockInTime = entry.clockInTime.toDate();
                const clockOutTime = entry.clockOutTime ? entry.clockOutTime.toDate() : null;
                let duration = null;
                if (clockOutTime) {
                    const totalDurationMs = clockOutTime.getTime() - clockInTime.getTime();
                    const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                        if (p.start && p.end) {
                            return acc + (p.end.toDate().getTime() - p.start.toDate().getTime());
                        }
                        return acc;
                    }, 0);

                    const netDurationMs = totalDurationMs - pauseDurationMs;
                    const totalMinutes = Math.round(netDurationMs / 60000);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    duration = hours + (minutes / 60);
                }
                reportData.push({
                    id: entry.id,
                    employeeName: `${employeeData.name} ${employeeData.surname}`,
                    areaName: areaData.name,
                    clockInDate: clockInTime.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                    clockInTimeFormatted: clockInTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOutTimeFormatted: clockOutTime ? clockOutTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso',
                    duration: duration,
                    note: entry.note || ''
                });
            }
        }
        setReports(reportData.sort((a,b) => a.employeeName.localeCompare(b.employeeName)));
        setView('reports');
    };

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedAndFilteredEmployees = useMemo(() => {
        let sortableItems = [...employees];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            sortableItems = sortableItems.filter(emp =>
                `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter)
            );
        }

        sortableItems.sort((a, b) => {
            if (sortConfig.key === 'name') {
                const nameA = `${a.name} ${a.surname}`.toLowerCase();
                const nameB = `${b.name} ${b.surname}`.toLowerCase();
                if (nameA < nameB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (nameA > nameB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            }
            if (sortConfig.key === 'status') {
                const getStatusValue = (emp) => {
                    if (!emp.activeEntry) return 0;
                    if (emp.isOnBreak) return 1;
                    return 2;
                };
                const statusA = getStatusValue(a);
                const statusB = getStatusValue(b);
                if (statusA < statusB) return sortConfig.direction === 'ascending' ? 1 : -1;
                if (statusA > statusB) return sortConfig.direction === 'ascending' ? -1 : 1;
                return 0;
            }
            return 0;
        });

        return sortableItems;
    }, [employees, searchTerm, sortConfig]);

    const handleExportXml = () => {
        let xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n<Report>\n';
        reports.forEach(entry => {
            xmlString += '  <Timbratura>\n';
            xmlString += `    <Dipendente>${entry.employeeName}</Dipendente>\n`;
            xmlString += `    <Area>${entry.areaName}</Area>\n`;
            xmlString += `    <Data>${entry.clockInDate}</Data>\n`;
            xmlString += `    <Entrata>${entry.clockInTimeFormatted}</Entrata>\n`;
            xmlString += `    <Uscita>${entry.clockOutTimeFormatted}</Uscita>\n`;
            xmlString += `    <Ore>${entry.duration ? entry.duration.toFixed(2) : 'N/A'}</Ore>\n`;
            xmlString += `    <Note>${entry.note || ''}</Note>\n`;
            xmlString += '  </Timbratura>\n';
        });
        xmlString += '</Report>';

        const blob = new Blob([xmlString], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Report_${dateRange.start}_${dateRange.end}.xml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    if (isLoading) { return <div className="min-h-screen flex items-center justify-center">Caricamento in corso...</div>; }

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md p-2 sm:p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <CompanyLogo />
                <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                    <span className="text-xs text-gray-600 text-center break-all">
                        Admin: {userData?.name && userData?.surname ? `${userData.name} ${userData.surname}` : user?.email}
                    </span>
                    <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 w-full sm:w-auto text-sm">Logout</button>
                </div>
            </header>
            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-center">
                        <div className="flex flex-wrap justify-center py-2 sm:space-x-4">
                            <button onClick={() => setView('dashboard')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Dashboard</button>
                            <button onClick={() => setView('employees')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'employees' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Dipendenti</button>
                            <button onClick={() => setView('areas')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'areas' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Aree</button>
                            {currentUserRole === 'admin' && <button onClick={() => setView('admins')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>}
                            {currentUserRole === 'admin' && <button onClick={() => setView('settings')} className={`py-2 px-3 sm:border-b-2 text-sm font-medium ${view === 'settings' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Impostazioni</button>}
                        </div>
                    </div>
                </div>
            </nav>

            {view !== 'reports' && (
                <div className="bg-gray-50 border-b border-gray-200 p-4">
                    <div className="max-w-7xl mx-auto w-full">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                        <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:flex-wrap md:gap-4">
                            
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="startDate" className="w-28 text-sm font-medium text-gray-700 text-left">Da:</label>
                                <input
                                    type="date"
                                    id="startDate"
                                    value={dateRange.start}
                                    onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                    className="p-1 border border-gray-300 rounded-md w-full"
                                />
                            </div>
                            
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="endDate" className="w-28 text-sm font-medium text-gray-700 text-left">A:</label>
                                <input
                                    type="date"
                                    id="endDate"
                                    value={dateRange.end}
                                    onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                    className="p-1 border border-gray-300 rounded-md w-full"
                                />
                            </div>
                            
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="areaFilter" className="w-28 text-sm font-medium text-gray-700 text-left">Area:</label>
                                <select 
                                    id="areaFilter"
                                    value={reportAreaFilter}
                                    onChange={e => setReportAreaFilter(e.target.value)}
                                    className="p-1 border border-gray-300 rounded-md w-full"
                                >
                                    <option value="all">Tutte le Aree</option>
                                    {allWorkAreas.map(area => (
                                        <option key={area.id} value={area.id}>{area.name}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="employeeFilter" className="w-28 text-sm font-medium text-gray-700 text-left">Dipendente:</label>
                                <select 
                                    id="employeeFilter"
                                    value={reportEmployeeFilter}
                                    onChange={e => setReportEmployeeFilter(e.target.value)}
                                    className="p-1 border border-gray-300 rounded-md w-full"
                                >
                                    <option value="all">Tutti i Dipendenti</option>
                                    {allEmployees.sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>
                                    ))}
                                </select>
                            </div>

                            <button onClick={generateReport} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm w-full md:w-auto md:ml-28">
                                Genera Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="p-4 sm:p-8 max-w-7xl mx-auto w-full text-center sm:text-left">
                {view === 'dashboard' && <DashboardView employees={employees} activeEntries={activeEntries} workAreas={workAreas} />}
                {view === 'employees' && <EmployeeManagementView employees={sortedAndFilteredEmployees} openModal={openModal} currentUserRole={currentUserRole} sortConfig={sortConfig} requestSort={requestSort} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />}
                {view === 'areas' && <AreaManagementView workAreas={workAreas} openModal={openModal} currentUserRole={currentUserRole} />}
                {view === 'admins' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} />}
                {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleExportXml={handleExportXml} />}
                {view === 'settings' && <PauseSettingsView />}
            </main>

            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={allWorkAreas} onDataUpdate={fetchData} user={user} superAdminEmail={superAdminEmail} allEmployees={allEmployees} currentUserRole={currentUserRole} userData={userData} />}
        </div>
    );
};

export default AdminDashboard;