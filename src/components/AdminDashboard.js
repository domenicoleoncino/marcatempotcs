import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
    doc, collection, addDoc, getDocs, query, where,
    updateDoc, Timestamp, getDoc, onSnapshot
} from 'firebase/firestore';
import CompanyLogo from './CompanyLogo';
import AdminModal from './AdminModal';

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

const EmployeeManagementView = ({ employees, openModal, currentUserRole, sortConfig, requestSort, searchTerm, setSearchTerm }) => {
    const getSortIndicator = (key) => {
        if (!sortConfig || sortConfig.key !== key) return '';
        return sortConfig.direction === 'ascending' ? ' ▲' : ' ▼';
    };
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Dipendenti</h1>
                <div className="flex gap-2">
                    {currentUserRole === 'admin' && <button onClick={() => openModal('newEmployee')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Crea Nuovo Dipendente</button>}
                    {currentUserRole === 'preposto' && <button onClick={() => openModal('assignEmployeeToArea')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 w-full sm:w-auto text-sm">Assegna Dipendente a Aree</button>}
                </div>
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
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('status')}>Stato{getSortIndicator('status')}</th>
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
                                        {emp.activeEntry ? (
                                            <>
                                                <button onClick={() => openModal('manualClockOut', emp)} className="px-2 py-1 text-xs bg-yellow-500 text-white rounded-md hover:bg-yellow-600 w-full text-center">Timbra Uscita</button>
                                                <button onClick={() => openModal('applyPredefinedPause', emp)} className="px-2 py-1 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600 w-full text-center mt-1">Applica Pausa</button>
                                            </>
                                        ) : (
                                            <button onClick={() => openModal('manualClockIn', emp)} className="px-2 py-1 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 w-full text-center">Timbra Entrata</button>
                                        )}
                                        {currentUserRole === 'admin' && (
                                            <>
                                                <div className="flex gap-2 w-full justify-start mt-1">
                                                    <button onClick={() => openModal('assignArea', emp)} className="text-xs text-indigo-600 hover:text-indigo-900">Aree</button>
                                                    <button onClick={() => openModal('editEmployee', emp)} className="text-xs text-green-600 hover:text-green-900">Modifica</button>
                                                    <button onClick={() => openModal('deleteEmployee', emp)} className="text-xs text-red-600 hover:text-red-900">Elimina</button>
                                                </div>
                                                {emp.deviceIds && emp.deviceIds.length > 0 && <button onClick={() => openModal('resetDevice', emp)} className="text-xs text-yellow-600 hover:text-yellow-900 mt-1">Resetta Disp.</button>}
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
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore Totali (nel report)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pausa (min)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {workAreas.map(area => (
                        <tr key={area.id}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{area.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold">{area.totalHours ? `${area.totalHours}h` : 'N/D'}</td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-bold text-gray-700">{area.pauseDuration || 0}</td>
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

const ReportView = ({ reports, title, handleExportXml, user }) => (
    <div>
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
            <div className="flex items-center space-x-2">
                <button disabled={reports.length === 0} className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm">Esporta Excel</button>
                <button onClick={handleExportXml} disabled={reports.length === 0} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-sm">Esporta XML</button>
            </div>
        </div>
        <div className="bg-white shadow-md rounded-lg overflow-x-auto">
            {reports.length === 0 ? <p className="p-4 text-sm text-gray-500">Nessun dato per il periodo selezionato.</p> : (
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
                                <td className="px-4 py-2 whitespace-nowrap text-sm">{entry.employeeName}{entry.createdBy !== entry.employeeId ? <span className="text-red-500 ml-1 font-bold">*</span> : ''}</td>
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
    const superAdminEmail = "domenico.leoncino@tcsitalia.com";

    const fetchData = useCallback(async () => {
        if (!user || !userData) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const allAreasSnapshot = await getDocs(collection(db, "work_areas"));
            const allAreasList = allAreasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllWorkAreas(allAreasList);
            setWorkAreasWithHours(allAreasList);

            const allEmployeesList = (await getDocs(collection(db, "employees"))).docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllEmployees(allEmployeesList);

            if (currentUserRole === 'preposto') {
                const q = query(collection(db, "employees"), where("userId", "==", user.uid));
                const adminEmployeeSnapshot = await getDocs(q);
                if (!adminEmployeeSnapshot.empty) {
                    const adminProfile = { id: adminEmployeeSnapshot.docs[0].id, ...adminEmployeeSnapshot.docs[0].data() };
                    setAdminEmployeeProfile(adminProfile);
                }
            }

            const qAdmins = query(collection(db, "users"), where("role", "in", ["admin", "preposto"]));
            const adminsSnapshot = await getDocs(qAdmins);
            const adminUsers = adminsSnapshot.docs.map(doc => {
                const data = doc.data();
                const managedAreaNames = data.managedAreaIds?.map(id => allAreasList.find(a => a.id === id)?.name).filter(Boolean) || [];
                return { id: doc.id, ...data, managedAreaNames };
            });
            setAdmins(adminUsers);
        } catch (error) {
            console.error("Errore nel caricamento dei dati statici: ", error);
        } finally {
            setIsLoading(false);
        }
    }, [user, userData, currentUserRole]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (!allEmployees.length || !allWorkAreas.length) return;
        const q = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const activeEntriesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (currentUserRole === 'preposto' && adminEmployeeProfile) {
                const adminActiveEntryData = activeEntriesList.find(entry => entry.employeeId === adminEmployeeProfile.id);
                if (adminActiveEntryData) {
                    const isOnBreak = adminActiveEntryData.pauses?.some(p => !p.end) || false;
                    setAdminActiveEntry({ ...adminActiveEntryData, id: adminActiveEntryData.id, isOnBreak });
                } else {
                    setAdminActiveEntry(null);
                }
            }
            const details = activeEntriesList.map(entry => {
                const employee = allEmployees.find(emp => emp.id === entry.employeeId);
                const area = allWorkAreas.find(ar => ar.id === entry.workAreaId);
                const isOnBreak = entry.pauses?.some(p => !p.end) || false;
                return {
                    id: entry.id,
                    employeeId: entry.employeeId,
                    employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
                    areaName: area ? area.name : 'Sconosciuta',
                    clockInTimeFormatted: entry.clockInTime.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    status: isOnBreak ? 'In Pausa' : 'Al Lavoro'
                };
            }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
            setActiveEmployeesDetails(details);
        });
        return () => unsubscribe();
    }, [allEmployees, allWorkAreas, adminEmployeeProfile, currentUserRole]);
    
    useEffect(() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", Timestamp.fromDate(startOfDay)));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let totalMinutes = 0;
            const now = new Date();
            snapshot.docs.forEach(doc => {
                const entry = doc.data();
                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : (entry.status === 'clocked-in' ? now : clockIn);
                const pauseDurationMs = (entry.pauses || []).reduce((acc, p) => {
                    if (p.start && p.end) return acc + (p.end.toMillis() - p.start.toMillis());
                    return acc;
                }, 0);
                const durationMs = (clockOut.getTime() - clockIn.getTime()) - pauseDurationMs;
                if (durationMs > 0) {
                    totalMinutes += (durationMs / 60000);
                }
            });
            setTotalDayHours((totalMinutes / 60).toFixed(2));
        });
        return () => unsubscribe();
    }, []);
    
    const sortedAndFilteredEmployees = useMemo(() => {
        let employeesInScope = allEmployees;
        if (currentUserRole === 'preposto' && userData.managedAreaIds) {
            const managedAreaIds = userData.managedAreaIds;
            employeesInScope = allEmployees.filter(emp =>
                (emp.workAreaIds && emp.workAreaIds.some(areaId => managedAreaIds.includes(areaId))) ||
                emp.userId === user.uid
            );
        }
        const employeesWithStatus = employeesInScope.map(emp => ({
            ...emp,
            activeEntry: activeEmployeesDetails.find(detail => detail.employeeId === emp.id) || null,
        }));
        let sortableItems = [...employeesWithStatus];
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            sortableItems = sortableItems.filter(emp =>
                `${emp.name} ${emp.surname}`.toLowerCase().includes(lowercasedFilter)
            );
        }
        return sortableItems;
    }, [allEmployees, activeEmployeesDetails, currentUserRole, userData, user, searchTerm]);

    const handleAdminClockIn = async (areaId, timestamp) => {
        if (!adminEmployeeProfile) return;
        try {
            await addDoc(collection(db, "time_entries"), {
                employeeId: adminEmployeeProfile.id,
                workAreaId: areaId,
                clockInTime: roundTimeWithCustomRules(new Date(timestamp), 'entrata'),
                clockOutTime: null,
                status: 'clocked-in',
                createdBy: user.uid,
                pauses: []
            });
        } catch (error) {
            alert(`Errore durante la timbratura: ${error.message}`);
        }
    };
    
    const handleAdminClockOut = async () => {
        if (!adminActiveEntry) return;
        try {
            await updateDoc(doc(db, "time_entries", adminActiveEntry.id), {
                clockOutTime: roundTimeWithCustomRules(new Date(), 'uscita'),
                status: 'clocked-out',
                createdBy: user.uid
            });
        } catch (error) {
            console.error("Errore nel timbrare l'uscita:", error);
        }
    };

    const handleAdminPause = async () => {
        if (!adminActiveEntry) return;
        try {
            const entryRef = doc(db, "time_entries", adminActiveEntry.id);
            const entryDoc = await getDoc(entryRef);
            const currentPauses = entryDoc.data().pauses || [];
            if (adminActiveEntry.isOnBreak) {
                const lastPauseIndex = currentPauses.length - 1;
                if (lastPauseIndex >= 0 && !currentPauses[lastPauseIndex].end) {
                    currentPauses[lastPauseIndex].end = Timestamp.fromDate(new Date());
                    await updateDoc(entryRef, { pauses: currentPauses });
                }
            } else {
                const newPause = { start: Timestamp.fromDate(new Date()), end: null };
                await updateDoc(entryRef, { pauses: [...currentPauses, newPause] });
            }
        } catch (error) {
            console.error("Errore nella gestione della pausa:", error);
            alert("Si è verificato un errore durante la gestione della pausa.");
        }
    };

    const handleAdminApplyPause = async (employee) => {
        if (!employee || !employee.activeEntry) {
            alert("Impossibile applicare la pausa: nessuna timbratura attiva trovata.");
            return;
        }
        const workArea = allWorkAreas.find(area => area.id === employee.activeEntry.workAreaId);
        if (!workArea || !workArea.pauseDuration || workArea.pauseDuration === 0) {
            alert("Nessuna durata di pausa predefinita impostata per questa area di lavoro.");
            return;
        }
        const pauseDurationInMinutes = workArea.pauseDuration;
        try {
            const entryRef = doc(db, "time_entries", employee.activeEntry.id);
            const entryDoc = await getDoc(entryRef);
            const currentPauses = entryDoc.data().pauses || [];
            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + pauseDurationInMinutes * 60000);
            const newPause = { 
                start: Timestamp.fromDate(startTime),
                end: Timestamp.fromDate(endTime),
                duration: pauseDurationInMinutes,
                createdBy: user.uid
            };
            await updateDoc(entryRef, {
                pauses: [...currentPauses, newPause]
            });
            alert(`Pausa di ${pauseDurationInMinutes} minuti applicata con successo.`);
        } catch (error) {
            console.error("Errore durante l'applicazione della pausa:", error);
            alert(`Si è verificato un errore: ${error.message}`);
        }
    };
    
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
        setIsLoading(true);
        try {
            const startDate = new Date(dateRange.start);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);

            let q = query(collection(db, "time_entries"), 
                where("clockInTime", ">=", Timestamp.fromDate(startDate)),
                where("clockInTime", "<=", Timestamp.fromDate(endDate))
            );

            if (reportEmployeeFilter !== 'all') {
                q = query(q, where("employeeId", "==", reportEmployeeFilter));
            }
            if (reportAreaFilter !== 'all') {
                q = query(q, where("workAreaId", "==", reportAreaFilter));
            }
            
            const querySnapshot = await getDocs(q);
            const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const areasWithHours = allWorkAreas.map(area => {
                const entriesForArea = entries.filter(entry => entry.workAreaId === area.id && entry.clockOutTime);
                const totalMillis = entriesForArea.reduce((sum, entry) => {
                    let duration = entry.clockOutTime.toMillis() - entry.clockInTime.toMillis();
                    const pauseMillis = (entry.pauses || []).reduce((pauseSum, p) => {
                        if (p.start && p.end) {
                            return pauseSum + (p.end.toMillis() - p.start.toMillis());
                        }
                        return pauseSum;
                    }, 0);
                    return sum + (duration - pauseMillis);
                }, 0);
                const totalHours = totalMillis / 3600000;
                return { ...area, totalHours: totalHours.toFixed(2) };
            });
            setWorkAreasWithHours(areasWithHours);

            const reportData = entries.map(entry => {
                const employee = allEmployees.find(e => e.id === entry.employeeId);
                const area = allWorkAreas.find(a => a.id === entry.workAreaId);
                const clockIn = entry.clockInTime.toDate();
                const clockOut = entry.clockOutTime ? entry.clockOutTime.toDate() : null;
                let duration = null;
                if (clockOut) {
                    const totalMs = clockOut.getTime() - clockIn.getTime();
                    const pauseMs = (entry.pauses || []).reduce((acc, p) => {
                        if (p.start && p.end) return acc + (p.end.toMillis() - p.start.toMillis());
                        return acc;
                    }, 0);
                    duration = (totalMs - pauseMs) / 3600000;
                }
                return {
                    id: entry.id,
                    employeeName: employee ? `${employee.name} ${employee.surname}` : 'Sconosciuto',
                    areaName: area ? area.name : 'Sconosciuta',
                    clockInDate: clockIn.toLocaleDateString('it-IT'),
                    clockInTimeFormatted: clockIn.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                    clockOutTimeFormatted: clockOut ? clockOut.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'In corso',
                    duration: duration,
                    note: entry.note || '',
                    createdBy: entry.createdBy || null,
                    employeeId: entry.employeeId,
                };
            });
            setReports(reportData);
            setReportTitle(`Report dal ${dateRange.start} al ${dateRange.end}`);
            setView('reports');
        } catch (error) {
            console.error("Errore generando il report:", error);
            alert("Si è verificato un errore durante la generazione del report.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportXml = () => { /* Logic to export XML */ };
    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    if (isLoading) { return <div className="min-h-screen flex items-center justify-center bg-gray-100 w-full"><p>Caricamento dati...</p></div>; }

    return (
        <div className="min-h-screen bg-gray-100 w-full">
            <header className="bg-white shadow-md">
                 <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <CompanyLogo />
                    {currentUserRole === 'preposto' && adminEmployeeProfile && (
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
                                            className={`text-xs px-3 py-1 text-white rounded ${adminActiveEntry.isOnBreak ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                                        >
                                            {adminActiveEntry.isOnBreak ? 'Termina Pausa' : 'Inizia Pausa'}
                                        </button>
                                        <button 
                                            onClick={handleAdminClockOut} 
                                            disabled={adminActiveEntry.isOnBreak}
                                            className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
                                        >
                                            Timbra Uscita
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-sm font-semibold text-red-600">Non sei al lavoro</p>
                                    <button onClick={() => openModal('adminClockIn', adminEmployeeProfile)} className="mt-1 text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Timbra Entrata</button>
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
            <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
                {view !== 'reports' && (
                   <div className="bg-white shadow-md rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4 text-center sm:text-left">Genera Report Personalizzato</h3>
                        <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:flex-wrap md:gap-4">
                           <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="startDate" className="w-28 text-sm font-medium text-gray-700 text-left">Da:</label>
                                <input type="date" id="startDate" value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} className="p-1 border border-gray-300 rounded-md w-full" />
                            </div>
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="endDate" className="w-28 text-sm font-medium text-gray-700 text-left">A:</label>
                                <input type="date" id="endDate" value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} className="p-1 border border-gray-300 rounded-md w-full" />
                            </div>
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="areaFilter" className="w-28 text-sm font-medium text-gray-700 text-left">Area:</label>
                                <select id="areaFilter" value={reportAreaFilter} onChange={e => setReportAreaFilter(e.target.value)} className="p-1 border border-gray-300 rounded-md w-full">
                                    <option value="all">Tutte le Aree</option>
                                    {allWorkAreas.map(area => (<option key={area.id} value={area.id}>{area.name}</option>))}
                                </select>
                            </div>
                            <div className="flex items-center justify-between md:justify-start">
                                <label htmlFor="employeeFilter" className="w-28 text-sm font-medium text-gray-700 text-left">Dipendente:</label>
                                <select id="employeeFilter" value={reportEmployeeFilter} onChange={e => setReportEmployeeFilter(e.target.value)} className="p-1 border border-gray-300 rounded-md w-full">
                                    <option value="all">Tutti i Dipendenti</option>
                                    {allEmployees.sort((a,b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)).map(emp => (<option key={emp.id} value={emp.id}>{emp.name} {emp.surname}</option>))}
                                </select>
                            </div>
                            <button onClick={generateReport} className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm w-full md:w-auto md:ml-auto">Genera Report</button>
                        </div>
                   </div>
                )}
                <main>
                    {view === 'dashboard' && <DashboardView totalEmployees={allEmployees.length} activeEmployeesDetails={activeEmployeesDetails} totalDayHours={totalDayHours} />}
                    {view === 'employees' && <EmployeeManagementView employees={sortedAndFilteredEmployees} openModal={openModal} currentUserRole={currentUserRole} requestSort={requestSort} sortConfig={sortConfig} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />}
                    {view === 'areas' && <AreaManagementView workAreas={workAreasWithHours} openModal={openModal} currentUserRole={currentUserRole} />}
                    {view === 'admins' && <AdminManagementView admins={admins} openModal={openModal} user={user} superAdminEmail={superAdminEmail} currentUserRole={currentUserRole} />}
                    {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleExportXml={handleExportXml} user={user} />}
                </main>
            </div>
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