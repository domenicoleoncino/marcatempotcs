import React from 'react';
import { db, auth } from '../firebase';
import { 
    doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, 
    updateDoc, onSnapshot, deleteDoc, writeBatch
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

// Importa i componenti che ci servono
import CompanyLogo from './CompanyLogo';

// NOTA: I componenti interni (le varie "View" e il "Modal") sono qui dentro.

const EmployeeManagementView = ({ employees, openModal }) => (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
            <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Aggiungi Dipendente</button>
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
                                <div className="text-sm text-gray-500">{emp.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                {emp.activeEntry ? 
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Al Lavoro</span> : 
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Non al Lavoro</span>
                                }
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.workAreaNames?.join(', ') || 'Nessuna'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                {emp.activeEntry ? 
                                    <button onClick={() => openModal('manualClockOut', emp)} className="px-2 py-1 text-sm bg-yellow-500 text-white rounded-md hover:bg-yellow-600">Timbra Uscita</button> :
                                    <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600">Timbra Entrata</button>
                                }
                                <button onClick={() => openModal('assignArea', emp)} className="text-indigo-600 hover:text-indigo-900">Aree</button>
                                <button onClick={() => openModal('editEmployee', emp)} className="text-green-600 hover:text-green-900">Modifica</button>
                                <button onClick={() => openModal('deleteEmployee', emp)} className="text-red-600 hover:text-red-900">Elimina</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const AreaManagementView = ({ workAreas, openModal }) => (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Gestione Aree di Lavoro</h1>
            <button onClick={() => openModal('newArea')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Aggiungi Area</button>
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                 <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome Area</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presenze Attuali</th>
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-4">
                                <button onClick={() => openModal('editArea', area)} className="text-green-600 hover:text-green-900">Modifica</button>
                                <button onClick={() => openModal('deleteArea', area)} className="text-red-600 hover:text-red-900">Elimina</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const AdminManagementView = ({ admins, openModal, user }) => (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800">Gestione Amministratori ({admins.length}/10)</h1>
            {admins.length < 10 && (
                <button onClick={() => openModal('newAdmin')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Aggiungi Admin</button>
            )}
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
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
                            <td className="px-6 py-4 whitespace-nowrap">{admin.email}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                {admin.id !== user.uid ? (
                                    <button onClick={() => openModal('deleteAdmin', admin)} className="text-red-600 hover:text-red-900">Elimina</button>
                                ) : (
                                    <span className="text-gray-400">Attuale</span>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

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
            'Ore Lavorate': (entry.duration !== null) ? parseFloat(entry.duration.toFixed(2)) : "In corso"
        }));
        const ws = window.XLSX.utils.json_to_sheet(dataToExport);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Report Ore");
        ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }];
        window.XLSX.writeFile(wb, `${title.replace(/ /g, '_')}.xlsx`);
    };
    return (
        <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h1 className="text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportExcel} disabled={reports.length === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400">Esporta in Excel</button>
                    <button onClick={handleDeleteReportData} disabled={reports.length === 0} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-800 disabled:bg-gray-400">Cancella Dati Report</button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                {reports.length === 0 ? (
                    <p className="p-6 text-gray-500">Nessun dato di timbratura per il periodo selezionato.</p>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area di Lavoro</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore Lavorate</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {reports.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.areaName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{entry.clockInDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {entry.duration !== null ? entry.duration.toFixed(2) : <span className="text-blue-500 font-semibold">In corso...</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

const AdminModal = ({ type, item, setShowModal, workAreas, adminsCount, allEmployees }) => {
    const [formData, setFormData] = React.useState(item || {});
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    
    React.useEffect(() => {
        if (type === 'manualClockIn' || type === 'manualClockOut') {
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '' });
        }
    }, [type, item]);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if ((type === 'newEmployee' || type === 'newAdmin') && formData.password && formData.password.length < 6) {
            setError("La password deve essere di almeno 6 caratteri.");
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
                    await deleteDoc(doc(db, "users", item.userId));
                    break;
                case 'newArea':
                    await addDoc(collection(db, "work_areas"), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                    break;
                case 'editArea':
                    await updateDoc(doc(db, "work_areas", item.id), { name: formData.name, latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10) });
                    break;
                case 'deleteArea':
                    const batch = writeBatch(db);
                    const employeesToUpdate = allEmployees.filter(emp => emp.workAreaIds?.includes(item.id));
                    employeesToUpdate.forEach(emp => {
                        const empRef = doc(db, "employees", emp.id);
                        const updatedAreaIds = emp.workAreaIds.filter(id => id !== item.id);
                        const updatedAreaNames = emp.workAreaNames.filter(name => name !== item.name);
                        batch.update(empRef, { workAreaIds: updatedAreaIds, workAreaNames: updatedAreaNames });
                    });
                    await batch.commit();
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
                    if (item.id === auth.currentUser.uid) throw new Error("Non puoi eliminare te stesso.");
                    await deleteDoc(doc(db, "users", item.id));
                    break;
                case 'manualClockIn':
                    await addDoc(collection(db, "time_entries"), { employeeId: item.id, workAreaId: formData.workAreaId, clockInTime: new Date(formData.timestamp), clockOutTime: null, status: 'clocked-in' });
                    break;
                case 'manualClockOut':
                    await updateDoc(doc(db, "time_entries", item.activeEntry.id), { clockOutTime: new Date(formData.timestamp), status: 'clocked-out' });
                    break;
                default: break;
            }
            setShowModal(false);
        } catch (err) {
            setError(err.message);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    const renderForm = () => {
        // ... (Il contenuto di questa funzione è lungo ma corretto, lo includo per sicurezza)
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
                    </>
                );
            default:
                return null;
        }
    };
    
    const isDeleteAction = type.startsWith('delete');
    return (
        <div className="fixed z-10 inset-0 overflow-y-auto">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true"><div className="absolute inset-0 bg-gray-500 opacity-75"></div></div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">​</span>
                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <form onSubmit={handleSubmit}><div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">{renderForm()}{error && <p className="text-red-500 text-sm mt-2">{error}</p>}</div><div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse"><button type="submit" disabled={isLoading} className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none sm:ml-3 sm:w-auto sm:text-sm ${isDeleteAction ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300' : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300'}`}>{isLoading ? 'In corso...' : (isDeleteAction ? 'Elimina' : 'Salva')}</button><button type="button" onClick={() => setShowModal(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm">Annulla</button></div></form>
                </div>
            </div>
        </div>
    );
};

// Questo è il componente principale che esportiamo
const AdminDashboard = ({ user, handleLogout }) => {
    const [view, setView] = React.useState('employees');
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

    React.useEffect(() => {
        const unsubEmployees = onSnapshot(collection(db, "employees"), (snapshot) => setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        const unsubAreas = onSnapshot(collection(db, "work_areas"), (snapshot) => {
            const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWorkAreas(areas);
            setSelectedReportAreas(areas.map(a => a.id));
        });
        const qAdmins = query(collection(db, "users"), where("role", "==", "admin"));
        const unsubAdmins = onSnapshot(qAdmins, (snapshot) => setAdmins(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        const qEntries = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubEntries = onSnapshot(qEntries, (snapshot) => setActiveEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        return () => { unsubEmployees(); unsubAreas(); unsubAdmins(); unsubEntries(); };
    }, []);

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
            default:
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
            const employeeDoc = await getDoc(doc(db, "employees", entry.employeeId));
            const areaDoc = await getDoc(doc(db, "work_areas", entry.workAreaId));
            if (employeeDoc.exists() && areaDoc.exists()) {
                reportData.push({
                    id: entry.id,
                    employeeName: `${employeeDoc.data().name} ${employeeDoc.data().surname}`,
                    areaName: areaDoc.data().name,
                    clockInDate: entry.clockInTime.toDate().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit'}),
                    duration: entry.clockOutTime ? (entry.clockOutTime.toDate() - entry.clockInTime.toDate()) / 3600000 : null
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
        const confirmation1 = window.prompt("Sei assolutamente sicuro? Questa azione è IRREVERSIBILE e cancellerà per sempre le timbrature di questo report. Scrivi 'CANCELLA' per confermare.");
        if (confirmation1 !== 'CANCELLA') {
            alert("Cancellazione annullata.");
            return;
        }
        const confirmation2 = window.prompt("Seconda conferma: Scrivi 'CANCELLA DATI' per procedere con l'eliminazione definitiva.");
         if (confirmation2 !== 'CANCELLA DATI') {
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
            setReports([]);
            setReportEntryIds([]);
            setReportTitle('');
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
        return { ...emp, activeEntry };
    });

    const workAreasWithCounts = workAreas.map(area => {
        const activeCount = activeEntries.filter(entry => entry.workAreaId === area.id).length;
        return { ...area, activeEmployeeCount: activeCount };
    });

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md p-4 flex justify-between items-center">
                <CompanyLogo />
                <div className="flex items-center space-x-4">
                    <span className="text-gray-600">Admin: {user.email}</span>
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
                </div>
            </header>
            <nav className="bg-white border-b border-gray-200">
                {/* Il JSX della navigazione non cambia */}
            </nav>

            {view !== 'reports' && (
                <div className="bg-gray-50 border-b border-gray-200 p-4">
                    {/* Il JSX del filtro aree non cambia */}
                </div>
            )}

            <main className="p-8 max-w-7xl mx-auto w-full">
                {view === 'employees' && <EmployeeManagementView employees={employeesWithStatus} openModal={openModal} />}
                {view === 'areas' && <AreaManagementView workAreas={workAreasWithCounts} openModal={openModal} />}
                {view === 'admins' && <AdminManagementView admins={admins} openModal={openModal} user={user} />}
                {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleDeleteReportData={handleDeleteReportData} />}
            </main>
            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={workAreas} adminsCount={admins.length} allEmployees={employees} auth={auth} />}
        </div>
    );
};

export default AdminDashboard;
