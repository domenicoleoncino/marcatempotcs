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
    
    const calculateCurrentHours = () => {
        let totalNetMinutes = 0;
        const now = new Date();

        activeEntries.forEach(entry => {
            const clockInTime = entry.clockInTime.toDate();
            let pauseDurationMs = 0;

            if (entry.pauses && entry.pauses.length > 0) {
                entry.pauses.forEach(p => {
                    const start = p.start.toDate();
                    // Se la pausa non è terminata, calcola fino ad ora
                    const end = p.end ? p.end.toDate() : now;
                    pauseDurationMs += (end.getTime() - start.getTime());
                });
            }

            const durationMs = (now.getTime() - clockInTime.getTime()) - pauseDurationMs;
            
            // Aggiunge i minuti netti di questo dipendente al totale
            if (durationMs > 0) {
                totalNetMinutes += Math.round(durationMs / 60000);
            }
        });

        if (totalNetMinutes <= 0) {
            return '0.00';
        }

        // Ora converte il totale dei minuti in ore decimali
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
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${entry.status === 'In Pausa' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                            {entry.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="p-4 text-sm text-gray-500">Nessun dipendente è attualmente al lavoro.</p>
                )}
            </div>
        </div>
    );
};

// Componente per la Gestione Dipendenti
const EmployeeManagementView = ({ employees, openModal, currentUserRole }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
            {currentUserRole === 'admin' && (
                <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Dipendente</button>
            )}
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
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
                                {emp.deviceId && <span className="text-xs text-green-600">(Dispositivo OK)</span>}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                                {emp.activeEntry ? (
                                    emp.isOnBreak ? 
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">In Pausa</span> :
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Al Lavoro</span>
                                ) : ( 
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Non al Lavoro</span>
                                )}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'N/A'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                <div className="flex flex-col items-start gap-1">
                                {emp.activeEntry ? 
                                    <button onClick={() => openModal('manualClockOut', emp)} className="px-2 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600 w-full text-center">Timbra Uscita</button> :
                                    <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button>
                                }
                                {currentUserRole === 'admin' && (
                                    <>
                                        <div className="flex gap-2 w-full justify-start mt-1">
                                            <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900">Aree</button>
                                            <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                            <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                        </div>
                                        {emp.deviceId && (
                                            <button onClick={() => openModal('resetDevice', emp)} className="text-xs text-yellow-600 hover:text-yellow-900 mt-1">Resetta Disp.</button>
                                        )}
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

// Componente per la Gestione Aree
const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Aree di Lavoro</h1>
            {currentUserRole === 'admin' && (
                <button onClick={() => openModal('newArea')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Area</button>
            )}
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
                        {currentUserRole === 'admin' && (
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        )}
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
                            {currentUserRole === 'admin' && (
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-900">Modifica</button>
                                        <button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-900">Elimina</button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

// Componente per la Gestione Admin
const AdminManagementView = ({ admins, openModal, user, currentUserRole }) => {
    
    const adminsToDisplay = admins.filter(admin => user && admin.id !== user.uid);

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Personale Amministrativo</h1>
                {currentUserRole === 'admin' && (
                    <button onClick={() => openModal('newAdmin')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Personale</button>
                )}
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruolo</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aree Gestite</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {adminsToDisplay.map(admin => (
                            <tr key={admin.id}>
                                <td className="px-4 py-2 whitespace-nowrap break-all text-sm">{admin.email}</td>
                                <td className="px-4 py-2 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${admin.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'}`}>
                                        {admin.role === 'admin' ? 'Admin' : 'Preposto'}
                                    </span>
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{admin.managedAreaNames?.join(', ') || (admin.role === 'admin' ? 'Tutte' : 'Nessuna')}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                                    <div className="flex items-center gap-3">
                                        {admin.role === 'preposto' && currentUserRole === 'admin' && (
                                            <button onClick={() => openModal('assignManagedAreas', admin)} className="text-indigo-600 hover:text-indigo-900 text-xs">Assegna Aree</button>
                                        )}
                                        <button onClick={() => openModal('deleteAdmin', admin)} className="text-red-600 hover:text-red-900 text-xs">Elimina</button>
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

// Componente per i Report
const ReportView = ({ reports, title, handleDeleteReportData }) => {
    const handleExportExcel = () => {
        if (typeof window.XLSX === 'undefined') {
            alert("La libreria di esportazione non è ancora stata caricata. Riprova tra un momento.");
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
                    <button onClick={handleExportExcel} disabled={reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta</button>
                    <button onClick={handleDeleteReportData} disabled={reports.length === 0} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-800 disabled:bg-gray-400 text-sm">Cancella</button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                {reports.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500">Nessun dato di timbratura per il periodo selezionato.</p>
                ) : (
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
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">
                                        {entry.duration !== null ? entry.duration.toFixed(2) : <span className="text-blue-500 font-semibold">...</span>}
                                    </td>
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

// Componente Modale
const AdminModal = ({ type, item, setShowModal, workAreas, adminsCount, allEmployees, onDataUpdate }) => {
    const [formData, setFormData] = React.useState(item ? { ...item, role: item.role || 'admin' } : { role: 'preposto' });
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
     const handleManagedAreasChange = (e) => {
        const { name, checked } = e.target;
        const currentAreas = formData.managedAreaIds || item?.managedAreaIds || [];
        if (checked) {
            setFormData({ ...formData, managedAreaIds: [...currentAreas, name] });
        } else {
            setFormData({ ...formData, managedAreaIds: currentAreas.filter(id => id !== name) });
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
                    if (adminsCount >= 10) throw new Error("Limite massimo raggiunto.");
                    const adminCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", adminCred.user.uid), { 
                        email: formData.email, 
                        role: formData.role,
                        managedAreaIds: formData.role === 'preposto' ? [] : null,
                        managedAreaNames: formData.role === 'preposto' ? [] : null
                    });
                    break;
                case 'deleteAdmin':
                    await deleteDoc(doc(db, "users", item.id)); 
                    break;
                case 'assignManagedAreas':
                    const selectedManagedAreaNames = workAreas.filter(area => formData.managedAreaIds?.includes(area.id)).map(area => area.name);
                    await updateDoc(doc(db, "users", item.id), { 
                        managedAreaIds: formData.managedAreaIds || [],
                        managedAreaNames: selectedManagedAreaNames
                    });
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
            // Non chiudere il modale in caso di errore per permettere all'utente di vedere il messaggio
        } finally {
            setIsLoading(false);
        }
    };
    
    // ... (Il resto del componente AdminModal e la sua renderizzazione)
};


// Componente Principale
const AdminDashboard = ({ user, handleLogout, userData }) => {
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

    const currentUserRole = userData?.role;

    const fetchData = React.useCallback(async () => {
        if (!user || !userData) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const allAreasSnapshot = await getDocs(collection(db, "work_areas"));
            const allAreas = allAreasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
            const adminsSnapshot = await getDocs(qAdmins);
            const adminUsers = adminsSnapshot.docs.map(doc => {
                const data = doc.data();
                const managedAreaNames = data.managedAreaIds 
                    ? data.managedAreaIds.map(id => allAreas.find(a => a.id === id)?.name).filter(Boolean)
                    : [];
                return { id: doc.id, ...data, managedAreaNames };
            });
            setAdmins(adminUsers);
            
            let areasToDisplay = allAreas;
            let employeesToDisplayQuery;
            if (currentUserRole === 'preposto' && userData.managedAreaIds) {
                areasToDisplay = allAreas.filter(area => userData.managedAreaIds.includes(area.id));
                const managedAreaIdsForQuery = userData.managedAreaIds.length > 0 ? userData.managedAreaIds : ['placeholder'];
                employeesToDisplayQuery = query(collection(db, "employees"), where("workAreaIds", "array-contains-any", managedAreaIdsForQuery));
            } else {
                employeesToDisplayQuery = query(collection(db, "employees"));
            }

            const employeesSnapshot = await getDocs(employeesToDisplayQuery);
            const employeesList = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const activeEntriesSnapshot = await getDocs(query(collection(db, "time_entries"), where("status", "==", "clocked-in")));
            const activeEntriesList = activeEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const employeesWithStatus = employeesList.map(emp => {
                const activeEntry = activeEntriesList.find(entry => entry.employeeId === emp.id);
                const isOnBreak = activeEntry?.pauses?.some(p => !p.end) || false;
                return { ...emp, activeEntry, isOnBreak };
            }).sort((a, b) => a.name.localeCompare(b.name));

            setEmployees(employeesWithStatus);

            const activeEntriesForScope = activeEntriesList.filter(entry => employeesList.some(e => e.id === entry.employeeId));
            setActiveEntries(activeEntriesForScope);

            const workAreasWithCounts = areasToDisplay.map(area => {
                const activeCount = activeEntriesForScope.filter(entry => entry.workAreaId === area.id).length;
                return { ...area, activeEmployeeCount: activeCount };
            }).sort((a, b) => a.name.localeCompare(b.name));
            
            setWorkAreas(workAreasWithCounts);
            setSelectedReportAreas(areasToDisplay.map(a => a.id));

        } catch (error) {
            console.error("Errore nel caricamento dei dati: ", error);
        } finally {
            setIsLoading(false);
        }
    }, [user, userData, currentUserRole]); 

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
        
        const allEmployeesSnapshot = await getDocs(collection(db, "employees"));
        const allEmployees = allEmployeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const reportData = [];
        for (const entry of entries) {
            const employeeData = allEmployees.find(e => e.id === entry.employeeId);
            const areaData = workAreas.find(a => a.id === entry.workAreaId);
            
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
                    clockInDate: clockInTime.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit'}),
                    clockInTimeFormatted: clockInTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOutTimeFormatted: clockOutTime ? clockOutTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso',
                    duration: duration,
                    note: entry.note || ''
                });
            }
        }
        setReports(reportData.sort((a, b) => a.clockInTimeFormatted.localeCompare(b.clockInTimeFormatted)));
        setView('reports');
    };

    const handleDeleteReportData = async () => {
        // ... (il tuo codice per questa funzione)
    };

    const handleAreaSelection = (areaId) => {
        // ... (il tuo codice per questa funzione)
    };
    
    const handleSelectAllAreas = (select) => {
        // ... (il tuo codice per questa funzione)
    };
    
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center">Caricamento in corso...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md p-2 sm:p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <CompanyLogo />
                <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
                    <span className="text-xs text-gray-600 text-center break-all">Admin: {user?.email}</span> 
                    <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 w-full sm:w-auto text-sm">Logout</button>
                </div>
            </header>
            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row justify-center sm:justify-start h-auto sm:h-16 py-2 sm:py-0">
                        <div className="flex flex-col sm:flex-row sm:space-x-8">
                            <button onClick={() => setView('dashboard')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'dashboard' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Dashboard</button>
                            <button onClick={() => setView('employees')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'employees' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Dipendenti</button>
                            <button onClick={() => setView('areas')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'areas' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Aree</button>
                            {currentUserRole === 'admin' && (
                                <button onClick={() => setView('admins')} className={`text-center py-2 sm:py-0 sm:inline-flex items-center px-1 sm:pt-1 sm:border-b-2 text-sm font-medium ${view === 'admins' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}>Gestione Admin</button>
                            )}
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
                {view === 'employees' && <EmployeeManagementView employees={employees} openModal={openModal} currentUserRole={currentUserRole} />}
                {view === 'areas' && <AreaManagementView workAreas={workAreas} openModal={openModal} currentUserRole={currentUserRole} />}
                {view === 'admins' && user && currentUserRole === 'admin' && (
                    <AdminManagementView 
                        admins={admins} 
                        openModal={openModal} 
                        user={user} 
                        currentUserRole={currentUserRole}
                    />
                )}
                {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleDeleteReportData={handleDeleteReportData} />}
            </main>
            {showModal && <AdminModal 
                type={modalType} 
                item={selectedItem} 
                setShowModal={setShowModal} 
                workAreas={workAreas} 
                adminsCount={admins.length} 
                allEmployees={employees} 
                onDataUpdate={fetchData} 
            />}
        </div>
    );
};

export default AdminDashboard;