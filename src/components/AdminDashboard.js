import React from 'react';
import React from 'react';
import { db, auth } from '../firebase';
import { 
    doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, 
    updateDoc, onSnapshot, deleteDoc, writeBatch
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

// Importa i componenti che ci servono
import CompanyLogo from './CompanyLogo';

// NOTA: I componenti interni (le varie "View" e il "Modal") restano qui.

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
    
    // Funzioni per gestire gli input del form, ora sono qui dentro
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
            setFormData({ ...item, timestamp: localDateTime, workAreaId: item?.workAreaIds?.[0] || '' });
        }
    }, [type, item]);

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
    
    const renderForm = () => { /* ... Il contenuto non è cambiato ... */ };
    const isDeleteAction = type.startsWith('delete');
    return (
        <div className="fixed z-10 inset-0 overflow-y-auto">
            {/* Il JSX del modal non cambia */}
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
        // ... (la logica non cambia)
    };

    const handleDeleteReportData = async () => {
        // ... (la logica non cambia)
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
            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={workAreas} adminsCount={admins.length} allEmployees={employees} />}
        </div>
    );
};

export default AdminDashboard;
