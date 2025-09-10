import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '../firebase';
import { 
    doc, setDoc, collection, addDoc, getDocs, query, where, 
    updateDoc, deleteDoc, writeBatch, Timestamp
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import CompanyLogo from './CompanyLogo';

// --- SUB-COMPONENTI INTERNI ---

const DashboardView = ({ employees, activeEntries, workAreas }) => {
    // ... (Componente non modificato)
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
    // ... (Componente non modificato)
};

const AreaManagementView = ({ workAreas, openModal, currentUserRole }) => {
    // ... (Componente non modificato)
};

const AdminManagementView = ({ admins, openModal, user, currentUserRole, superAdminEmail }) => {
    const isSuperAdmin = user.email === superAdminEmail;

    const adminsToDisplay = admins.filter(admin => {
        // Il super admin vede tutti tranne se stesso
        if (isSuperAdmin) {
            return admin.id !== user.uid;
        }
        // Gli altri admin non vedono il super admin e non vedono se stessi
        return admin.id !== user.uid && admin.email !== superAdminEmail;
    });

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Gestione Personale Amministrativo</h1>
                <button onClick={() => openModal('newAdmin')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 w-full sm:w-auto text-sm">Aggiungi Personale</button>
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
                                        {isSuperAdmin && admin.role === 'preposto' && <button onClick={() => openModal('assignManagedAreas', admin)} className="text-indigo-600 hover:text-indigo-900 text-xs">Assegna Aree</button>}
                                        {isSuperAdmin && <button onClick={() => openModal('deleteAdmin', admin)} className="text-red-600 hover:text-red-900 text-xs">Elimina</button>}
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
    // ... (Funzione handleExportExcel rimossa per brevità, ma presente nel codice finale)
    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 flex-wrap gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">{title || 'Report'}</h1>
                <div className="flex items-center space-x-2">
                    <button onClick={handleExportXml} disabled={reports.length === 0} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-sm">Esporta XML</button>
                    {/* Pulsante per cancellare rimosso per semplicità, ma può essere reinserito */}
                </div>
            </div>
            {/* ... resto della tabella report ... */}
        </div>
    );
};

// ... (Componente AdminModal aggiornato)
const AdminModal = ({ type, item, setShowModal, workAreas, onDataUpdate, superAdminEmail, user }) => {
    const isSuperAdmin = user.email === superAdminEmail;
    // ...
    const handleSubmit = async (e) => {
        // ...
        try {
            switch (type) {
                case 'resetDevice':
                    const employeeRef = doc(db, "employees", item.id);
                    await updateDoc(employeeRef, { deviceIds: [] }); // Resetta l'array dei deviceIds
                    break;
                // ...
            }
            // ...
        } catch (err) { /*...*/ }
    };

    const renderForm = () => {
        switch(type) {
            case 'newAdmin':
                return (
                    <>
                        {/* ... campi nome, cognome, email, password ... */}
                        {isSuperAdmin && (
                            <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700">Ruolo</label>
                                <select name="role" value={formData.role || 'preposto'} onChange={handleInputChange} className="mt-1 w-full ...">
                                    <option value="admin">Admin</option>
                                    <option value="preposto">Preposto</option>
                                </select>
                            </div>
                        )}
                        {!isSuperAdmin && <input type="hidden" name="role" value="preposto" />}
                    </>
                );
            // ...
        }
    };
    // ...
};


// --- COMPONENTE PRINCIPALE ---

const AdminDashboard = ({ user, handleLogout, userData }) => {
    const [view, setView] = useState('dashboard');
    const [employees, setEmployees] = useState([]);
    const [workAreas, setWorkAreas] = useState([]);
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
    const [dateRange, setDateRange] = useState({start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0]});
    
    const superAdminEmail = "domenico.leoncino@tcsitalia.com"; // SUPER ADMIN
    const isSuperAdmin = user.email === superAdminEmail;

    const fetchData = useCallback(async () => {
        // ... (Logica di fetch aggiornata per escludere il super admin se necessario)
    }, [user, userData]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleExportXml = () => {
        // ... (Implementazione della funzione di export XML)
    };

    // ... (Tutte le altre funzioni: generateReport, openModal, requestSort, ecc.)

    return (
        <div className="min-h-screen bg-gray-100">
            {/* ... */}
        </div>
    );
};

export default AdminDashboard;