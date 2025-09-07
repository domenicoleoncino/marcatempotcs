import React from 'react';
import { db, auth } from '../firebase';
import { 
    doc, setDoc, collection, addDoc, getDocs, query, where, 
    updateDoc, deleteDoc, writeBatch
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

// Importa i componenti che ci servono
import CompanyLogo from './CompanyLogo';

// Componente DashboardView
const DashboardView = ({ employees, activeEntries, workAreas }) => {
    
    // Calcola le ore totali accumulate fino ad ora dai dipendenti attivi, SOTTRAENDO le pause
    const calculateCurrentHours = () => {
        let totalHours = 0;
        const now = new Date();
        activeEntries.forEach(entry => {
            const clockInTime = entry.clockInTime.toDate();
            let pauseDurationMs = 0;

            // Calcola la durata delle pause completate e di quella in corso
            if (entry.pauses && entry.pauses.length > 0) {
                entry.pauses.forEach(p => {
                    const start = p.start.toDate();
                    const end = p.end ? p.end.toDate() : now; // Se la pausa è in corso, calcola fino ad ora
                    pauseDurationMs += (end - start);
                });
            }

            const durationMs = (now - clockInTime) - pauseDurationMs;
            totalHours += durationMs / 3600000; // Converti in ore
        });
        return totalHours > 0 ? totalHours.toFixed(2) : '0.00';
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard Riepilogativa</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-md flex items-center">
                    <div className="bg-green-100 p-3 rounded-full mr-4 flex-shrink-0">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Dipendenti Attivi</p>
                        <p className="text-2xl font-bold text-gray-800">{activeEntries.length} / {employees.length}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-md flex items-center">
                    <div className="bg-blue-100 p-3 rounded-full mr-4 flex-shrink-0">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Ore Lavorate Oggi (nette)</p>
                        <p className="text-2xl font-bold text-gray-800">{calculateCurrentHours()}</p>
                    </div>
                </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-4">Chi è al Lavoro Ora</h2>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                {activeEmployeesDetails.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area di Lavoro</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ora di Entrata</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {activeEmployeesDetails.map(entry => (
                                <tr key={entry.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.areaName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.clockInTimeFormatted}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="p-6 text-gray-500">Nessun dipendente è attualmente al lavoro.</p>
                )}
            </div>
        </div>
    );
};


// Componente per la Gestione Dipendenti
const EmployeeManagementView = ({ employees, openModal }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
            <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto">Aggiungi Dipendente</button>
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Assegnate</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {employees.map(emp => (
                        <tr key={emp.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{emp.name} {emp.surname}</div>
                                <div className="text-sm text-gray-500 break-all">{emp.email}</div>
                                {emp.deviceId && <span className="text-xs text-green-600">(Dispositivo Registrato)</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                {emp.activeEntry ? (
                                    emp.isOnBreak ? 
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">In Pausa</span> :
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Al Lavoro</span>
                                ) : ( 
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Non al Lavoro</span>
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'Nessuna'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                                {emp.activeEntry ? 
                                    <button onClick={() => openModal('manualClockOut', emp)} className="px-2 py-1 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600 w-full text-center sm:w-auto">Timbra Uscita</button> :
                                    <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center sm:w-auto">Timbra Entrata</button>
                                }
                                <button onClick={() => openModal('assignArea', emp)} className="text-indigo-600 hover:text-indigo-900">Aree</button>
                                <button onClick={() => openModal('editEmployee', emp)} className="text-green-600 hover:text-green-900">Modifica</button>
                                <button onClick={() => openModal('deleteEmployee', emp)} className="text-red-600 hover:text-red-900">Elimina</button>
                                {emp.deviceId && (
                                    <button onClick={() => openModal('resetDevice', emp)} className="text-yellow-600 hover:text-yellow-900">Resetta Dispositivo</button>
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

// Componente per la Gestione Aree
const AreaManagementView = ({ workAreas, openModal }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-800">Gestione Aree di Lavoro</h1>
            <button onClick={() => openModal('newArea')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto">Aggiungi Area</button>
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                 <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome Area</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presenze</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latitudine</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Longitudine</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raggio (m)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {workAreas.map(area => (
                        <tr key={area.id}>
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{area.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-lg text-center">{area.activeEmployeeCount}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{area.latitude}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{area.longitude}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{area.radius}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                               <div className="flex items-center gap-4">
                                <button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-900">Modifica</button>
                                <button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-900">Elimina</button>
                               </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

// Componente per la Gestione Admin
const AdminManagementView = ({ admins, openModal, user }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-3xl font-bold text-gray-800">Gestione Admin ({admins.length}/10)</h1>
            {admins.length < 10 && (
                <button onClick={() => openModal('newAdmin')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto">Aggiungi Admin</button>
            )}
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                 <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Amministratore</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {admins.map(admin => (
                        <tr key={admin.id}>
                            <td className="px-6 py-4 whitespace-nowrap break-all flex items-center">
                                {admin.email}
                                {user && admin.id === user.uid && (
                                    <span className="ml-3 px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">Attuale</span>
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                {user && admin.id !== user.uid ? ( 
                                    <button onClick={() => openModal('deleteAdmin', admin)} className="text-red-600 hover:text-red-900">Elimina</button>
                                ) : (
                                    <span className="text-gray-400">N/A</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

// Componente per i Report
const ReportView = ({ reports, title, handleDeleteReportData }) => {
    const handleExportExcel = () => {
        if (typeof window.XLSX === 'undefined') {
            alert("La libreria di esportazione non è ancora stata caricata. Riprova tra un momento.");
            return;
        }
        const dataToExport = reports.map(entry => ({
            'Dipendente': entry.employeeName,
            'Area di Lavoro': entry.areaName,
            'Data': entry.clockInDate,
            'Ora Entrata': entry.clockInTimeFormatted,
            'Ora Uscita': entry.clockOutTimeFormatted,
            'Ore Lavorate': (entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso",
            'Note': entry.note
        }));
        const ws = window.XLSX.utils.json_to_sheet(dataToExport);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Report Ore");
        ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 40 }];
        window.XLSX.writeFile(wb, `${title.replace(/ /g, '_')}.xlsx`);
    };
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
                <h1 className="text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportExcel} disabled={reports.length === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400">Esporta in Excel</button>
                    <button onClick={handleDeleteReportData} disabled={reports.length === 0} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-800 disabled:bg-gray-400">Cancella Dati Report</button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                {reports.length === 0 ? (
                    <p className="p-6 text-gray-500">Nessun dato di timbratura per il periodo selezionato.</p>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area di Lavoro</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entrata</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uscita</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore Lavorate</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reports.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.areaName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.clockInDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.clockInTimeFormatted}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.clockOutTimeFormatted}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {entry.duration !== null ? entry.duration.toFixed(2) : <span className="text-blue-500 font-semibold">In corso...</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.note}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// Componente Modale
const AdminModal = ({ type, item, setShowModal, workAreas, adminsCount, allEmployees, onDataUpdate }) => {
    const [formData, setFormData] = React.useState(item || {});
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    
    const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
    const handleCheckboxChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.workAreaIds || item?.workAreaIds || [];
        if(checked) {
            setFormData({...formData, workAreaIds: [...currentAreas, name]});
        } else {
            setFormData({...formData, workAreaIds: currentAreas.filter(id => id !== name)});
        }
    };

    React.useEffect(() => {
        if (type === 'manualClockIn' || type === 'manualClockOut') {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '', note: item?.activeEntry?.note || '' });
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((type === 'newEmployee' || type === 'newAdmin') && formData.password && formData.password.length < 6) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        
        if (type === 'deleteAdmin' && item.id === auth.currentUser.uid) {
            setError("Non puoi eliminare te stesso.");
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            switch (type) {
                case 'newEmployee':
                    const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", userCred.user.uid), { email: formData.email, role: 'employee' });
                    await addDoc(collection(db, "employees"), { userId: userCred.user.uid, name: formData.name, surname: formData.surname, phone: formData.phone, email: formData.email, workAreaIds: [], workAreaNames: [] });
                    break;
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
                case 'newAdmin':
                    if (adminsCount >= 10) throw new Error("Limite massimo di 10 amministratori raggiunto.");
                    const adminCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", adminCred.user.uid), { email: formData.email, role: 'admin' });
                    break;
                case 'deleteAdmin':
                    await deleteDoc(doc(db, "users", item.id)); 
                    break;
                case 'manualClockIn':
                    await addDoc(collection(db, "time_entries"), { 
                        employeeId: item.id, 
                        workAreaId: formData.workAreaId, 
                        clockInTime: new Date(formData.timestamp), 
                        clockOutTime: null, 
                        status: 'clocked-in',
                        note: formData.note || null,
                        pauses: []
                    });
                    break;
                case 'manualClockOut':
                    await updateDoc(doc(db, "time_entries", item.activeEntry.id), { 
                        clockOutTime: new Date(formData.timestamp), 
                        status: 'clocked-out',
                        note: formData.note || item.activeEntry.note || null
                    });
                    break;
                case 'resetDevice':
                    const employeeRef = doc(db, "employees", item.id);
                    await updateDoc(employeeRef, { deviceId: null });
                    break;
                default: break;
            }
            await onDataUpdate();
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            await onDataUpdate();
            setShowModal(false);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderForm = () => {
        switch (type) {
            case 'newEmployee':
            case 'editEmployee':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">{type === 'newEmployee' ? 'Nuovo Dipendente' : `Modifica ${item.name}`}</h3>
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input name="surname" value={formData.surname || ''} onChange={handleInputChange} placeholder="Cognome" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefono" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        {type === 'newEmployee' && <>
                            <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                            <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        </>}
                    </>
                );
            case 'deleteEmployee':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Conferma Eliminazione</h3>
                        <p className="mt-2 text-sm text-gray-500">Sei sicuro di voler eliminare il dipendente {item.name} {item.surname}? L'azione è irreversibile.</p>
                        <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded-md text-sm">
                            <strong>Attenzione:</strong> Dovrai eliminare manualmente l'utente ({item.email}) dalla sezione <strong>Authentication</strong> della console di Firebase.
                        </div>
                    </>
                );
            case 'newArea':
            case 'editArea':
                 return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">{type === 'newArea' ? 'Nuova Area di Lavoro' : `Modifica ${item.name}`}</h3>
                        <input name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="Nome Area" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input name="latitude" value={formData.latitude || ''} onChange={handleInputChange} placeholder="Latitudine" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input name="longitude" value={formData.longitude || ''} onChange={handleInputChange} placeholder="Longitudine" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input name="radius" value={formData.radius || ''} onChange={handleInputChange} placeholder="Raggio in metri" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                    </>
                );
            case 'deleteArea':
                 return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Conferma Eliminazione</h3>
                        <p className="mt-2 text-sm text-gray-500">Sei sicuro di voler eliminare l'area {item.name}? Verrà rimossa da tutti i dipendenti a cui è assegnata. L'azione è irreversibile.</p>
                    </>
                );
            case 'assignArea':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Assegna Aree a {item.name} {item.surname}</h3>
                        <div className="mt-4 space-y-2">
                            {workAreas.map(area => (
                                <div key={area.id} className="flex items-center">
                                    <input
                                        id={`area-${area.id}`} name={area.id} type="checkbox"
                                        onChange={handleCheckboxChange} defaultChecked={item.workAreaIds?.includes(area.id)}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor={`area-${area.id}`} className="ml-3 block text-sm font-medium text-gray-700">{area.name}</label>
                                </div>
                            ))}
                        </div>
                    </>
                );
            case 'newAdmin':
                 return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Nuovo Amministratore</h3>
                        <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input type="password" name="password" value={formData.password || ''} onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                    </>
                );
            case 'deleteAdmin':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Conferma Eliminazione</h3>
                        <p className="mt-2 text-sm text-gray-500">Sei sicuro di voler eliminare l'amministratore {item.email}? L'azione è irreversibile.</p>
                         <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded-md text-sm">
                            <strong>Attenzione:</strong> Dovrai eliminare manualmente l'utente ({item.email}) dalla sezione <strong>Authentication</strong> della console di Firebase.
                        </div>
                    </>
                );
            case 'manualClockIn':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Timbratura Manuale Entrata per {item.name}</h3>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700">Data e Ora di Entrata</label>
                            <input type="datetime-local" name="timestamp" value={formData.timestamp || ''} onChange={handleInputChange} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700">Area di Lavoro</label>
                            <select name="workAreaId" value={formData.workAreaId || ''} onChange={handleInputChange} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" required>
                                <option value="" disabled>Seleziona un'area</option>
                                {workAreas.filter(wa => item.workAreaIds?.includes(wa.id)).map(area => (
                                    <option key={area.id} value={area.id}>{area.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700">Note (opzionale)</label>
                            <input name="note" value={formData.note || ''} onChange={handleInputChange} placeholder="Es: Dimenticanza del dipendente" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" />
                        </div>
                    </>
                );
            case 'manualClockOut':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Timbratura Manuale Uscita per {item.name}</h3>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700">Data e Ora di Uscita</label>
                            <input type="datetime-local" name="timestamp" value={formData.timestamp || ''} onChange={handleInputChange} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-gray-700">Note (opzionale)</label>
                            <input name="note" value={formData.note || ''} onChange={handleInputChange} placeholder="Es: Uscita anticipata per permesso" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md" />
                        </div>
                    </>
                );
            case 'resetDevice':
                return (
                    <>
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Conferma Reset Dispositivo</h3>
                        <p className="mt-2 text-sm text-gray-500">
                            Sei sicuro di voler scollegare il dispositivo attuale per il dipendente <strong>{item.name} {item.surname}</strong>?
                        </p>
                        <p className="mt-2 text-sm text-gray-500">
                            Potrà registrare un nuovo dispositivo alla sua prossima timbratura.
                        </p>
                    </>
                );
            default:
                return null;
        }
    };
    
    const primaryButtonClass = () => {
        if (type.startsWith('delete')) return 'bg-red-600 hover:bg-red-700 disabled:bg-red-300';
        if (type === 'resetDevice') return 'bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300';
        return 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300';
    }
    const primaryButtonText = () => {
        if (type.startsWith('delete')) return 'Elimina';
        if (type === 'resetDevice') return 'Resetta';
        return 'Salva';
    }

    return (
        <div className="fixed z-10 inset-0 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true"><div className="absolute inset-0 bg-gray-500 opacity-75"></div></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">​</span>
                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <form onSubmit={handleSubmit}>
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            {renderForm()}
                            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button type="submit" disabled={isLoading} className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none sm:ml-3 sm:w-auto sm:text-sm ${primaryButtonClass()}`}>
                                {isLoading ? 'In corso...' : primaryButtonText()}
                            </button>
                            <button type="button" onClick={() => setShowModal(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm">Annulla</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Componente Principale
const AdminDashboard = ({ user, handleLogout }) => {
    const [view, setView] = React.useState('dashboard');
    const [employees, setEmployees] = React.useState([]);
    const [workAreas, setWorkAreas] = React.useState([]);
    const [admins, setAdmins] = React.useState([]);
    const [activeEntries, setActiveEntries] = React.useState([]);
    const [reports, setReports] = React.useState([]);
    const [reportTitle, setReportTitle] = React.useState('');
    const [showModal, setShowModal] = React.useState(false);
    const [modalType, setModalType] = React.useState('');
    const [selectedItem, setSelectedItem] = React.useState(null);
    const [reportEntryIds, setReportEntryIds] = React.useState([]);
    const [selectedReportAreas, setSelectedReportAreas] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(true); 

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const employeesSnapshot = await getDocs(collection(db, "employees"));
            setEmployees(employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const areasSnapshot = await getDocs(collection(db, "work_areas"));
            const areas = areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWorkAreas(areas);
            setSelectedReportAreas(areas.map(a => a.id));

            const qAdmins = query(collection(db, "users"), where("role", "==", "admin"));
            const adminsSnapshot = await getDocs(qAdmins);
            setAdmins(adminsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

            const qEntries = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
            const entriesSnapshot = await getDocs(qEntries);
            setActiveEntries(entriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Errore nel caricamento dei dati: ", error);
        } finally {
            setIsLoading(false);
        }
    }, []); 

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openModal = (type, item = null) => {
        setModalType(type);
        setSelectedItem(item);
        setShowModal(true);
    };
    
    const generateReport = async (reportType) => {
        if (selectedReportAreas.length === 0) {
            alert("Devi selezionare almeno un'area di lavoro per generare il report.");
            return;
        }
        let startDate;
        const now = new Date();
        let title = '';
        switch(reportType) {
            case 'weekly':
                const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)));
                firstDayOfWeek.setHours(0, 0, 0, 0);
                startDate = firstDayOfWeek;
                title = 'Report Settimanale';
                break;
            case 'monthly':
                const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                startDate = firstDayOfMonth;
                title = 'Report Mensile';
                break;
            default: // 'daily'
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                startDate = today;
                title = 'Report Giornaliero';
                break;
        }
        setReportTitle(title);
        const q = query(
            collection(db, "time_entries"), 
            where("clockInTime", ">=", startDate),
            where("workAreaId", "in", selectedReportAreas)
        );
        const querySnapshot = await getDocs(q);
        const entries = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        setReportEntryIds(entries.map(entry => entry.id));
        const reportData = [];
        for (const entry of entries) {
            const employeeData = employees.find(e => e.id === entry.employeeId);
            const areaData = workAreas.find(a => a.id === entry.workAreaId);
            
            if (employeeData && areaData) {
                const clockInTime = entry.clockInTime.toDate();
                const clockOutTime = entry.clockOutTime ? entry.clockOutTime.toDate() : null;

                let duration = null;
                if (clockOutTime) {
                    const totalDurationMs = clockOutTime - clockInTime;
                    const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                        if (p.start && p.end) {
                            return acc + (p.end.toDate() - p.start.toDate());
                        }
                        return acc;
                    }, 0);
                    duration = (totalDurationMs - pauseDurationMs) / 3600000;
                }

                reportData.push({
                    id: entry.id,
                    employeeName: `${employeeData.name} ${employeeData.surname}`,
                    areaName: areaData.name,
                    clockInDate: clockInTime.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit'}),
                    clockInTimeFormatted: clockInTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOutTimeFormatted: clockOutTime ? clockOutTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso',
                    duration: duration,
                    note: entry.note || ''
                });
            }
        }
        setReports(reportData);
        setView('reports');
    };

    const handleDeleteReportData = async () => {
        if (reportEntryIds.length === 0) {
            alert("Nessun dato da cancellare.");
            return;
        }
        const confirmation = window.confirm("Sei assolutamente sicuro? Questa azione è IRREVERSIBILE e cancellerà per sempre le timbrature di questo report.");
        if (!confirmation) {
            alert("Cancellazione annullata.");
            return;
        }
        try {
            const batch = writeBatch(db);
            reportEntryIds.forEach(id => {
                const docRef = doc(db, "time_entries", id);
                batch.delete(docRef);
            });
            await batch.commit();
            alert(`Cancellazione completata con successo! Sono state rimosse ${reportEntryIds.length} timbrature.`);
            await fetchData();
            setView('employees');
        } catch (error) {
            console.error("Errore durante la cancellazione dei dati:", error);
            alert("Si è verificato un errore durante la cancellazione dei dati.");
        }
    };

    const handleAreaSelection = (areaId) => {
        setSelectedReportAreas(prev => {
            if (prev.includes(areaId)) {
                return prev.filter(id => id !== areaId);
            } else {
                return [...prev, areaId];
            }
        });
    };
    
    const handleSelectAllAreas = (select) => {
        if (select) {
            setSelectedReportAreas(workAreas.map(a => a.id));
        } else {
            setSelectedReportAreas([]);
        }
    };

    const employeesWithStatus = employees.map(emp => {
        const activeEntry = activeEntries.find(entry => entry.employeeId === emp.id);
        const isOnBreak = activeEntry?.pauses?.some(p => !p.end) || false;
        return { ...emp, activeEntry, isOnBreak };
    });

    const workAreasWithCounts = workAreas.map(area => {
        const activeCount = activeEntries.filter(entry => entry.workAreaId === area.id).length;
        return { ...area, activeEmployeeCount: activeCount };
    });

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento in corso...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <CompanyLogo />
                <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                    <span className="text-gray-600 text-sm text-center break-all">Admin: {user?.email}</span> 
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 w-full sm:w-auto">Logout</button>
                </div>
            </header>
            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row justify-center sm:justify-start h-auto sm:h-16 py-2 sm:py-0">
                        <div className="flex flex-col sm:flex-row sm:space-x-8">
                            <button onClick={() => setView('dashboard')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Dashboard</button>
                            <button onClick={() => setView('employees')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'employees' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Dipendenti</button>
                            <button onClick={() => setView('areas')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'areas' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Aree</button>
                            <button onClick={() => setView('admins')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>
                        </div>
                    </div>
                </div>
            </nav>

            {view !== 'reports' && (
                <div className="bg-gray-50 border-b border-gray-200 p-4">
                    <div className="max-w-7xl mx-auto">
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Genera Report</h3>
                        <div className="flex items-center flex-wrap gap-4 mb-4">
                            <div className="flex space-x-2">
                                <button onClick={() => generateReport('daily')} className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm">Giornaliero</button>
                                <button onClick={() => generateReport('weekly')} className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm">Settimanale</button>
                                <button onClick={() => generateReport('monthly')} className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm">Mensile</button>
                            </div>
                        </div>
                        <h4 className="text-md font-medium text-gray-800 mb-2">Filtra per Aree</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            {workAreas.map(area => (
                                <div key={area.id} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id={`filter-area-${area.id}`}
                                        checked={selectedReportAreas.includes(area.id)}
                                        onChange={() => handleAreaSelection(area.id)}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor={`filter-area-${area.id}`} className="ml-2 text-sm text-gray-700">{area.name}</label>
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 flex space-x-2">
                             <button onClick={() => handleSelectAllAreas(true)} className="text-xs text-indigo-600 hover:underline">Seleziona Tutti</button>
                             <button onClick={() => handleSelectAllAreas(false)} className="text-xs text-indigo-600 hover:underline">Deseleziona Tutti</button>
                        </div>
                    </div>
                </div>
            )}
            <main className="p-4 sm:p-8 max-w-7xl mx-auto w-full">
                {view === 'dashboard' && <DashboardView employees={employees} activeEntries={activeEntries} workAreas={workAreas} />}
                {view === 'employees' && <EmployeeManagementView employees={employeesWithStatus} openModal={openModal} />}
                {view === 'areas' && <AreaManagementView workAreas={workAreasWithCounts} openModal={openModal} />}
                {view === 'admins' && user && <AdminManagementView admins={admins} openModal={openModal} user={user} />}
                {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleDeleteReportData={handleDeleteReportData} />}
            </main>
            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={workAreas} adminsCount={admins.length} allEmployees={employees} onDataUpdate={fetchData} />}
        </div>
    );
};

export default AdminDashboard;

