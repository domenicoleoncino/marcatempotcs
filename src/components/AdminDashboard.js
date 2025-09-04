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
    // ... il contenuto di questo componente non cambia ...
};

const AdminModal = ({ type, item, setShowModal, workAreas, adminsCount, allEmployees }) => {
    // ... il contenuto di questo componente non cambia ...
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
        // ... la logica useEffect non cambia ...
    }, []);

    const openModal = (type, item = null) => { /* ... */ };
    const generateReport = async (reportType) => { /* ... */ };
    const handleDeleteReportData = async () => { /* ... */ };
    const handleAreaSelection = (areaId) => { /* ... */ };
    const handleSelectAllAreas = (select) => { /* ... */ };

    const employeesWithStatus = employees.map(emp => {
        const activeEntry = activeEntries.find(entry => entry.employeeId === emp.id);
        return { ...emp, activeEntry };
    });

    const workAreasWithCounts = workAreas.map(area => {
        const activeCount = activeEntries.filter(entry => entry.workAreaId === area.id).length;
        return { ...area, activeEmployeeCount: activeCount };
    });

    return (
        // ATTENZIONE: abbiamo rimosso il div esterno con "min-h-screen"
        <>
            <header className="bg-white shadow-md p-4 flex justify-between items-center w-full max-w-7xl mb-4">
                <CompanyLogo />
                <div className="flex items-center space-x-4">
                    <span className="text-gray-600">Admin: {user.email}</span>
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
                </div>
            </header>
            <nav className="bg-white border-b border-t border-gray-200 w-full mb-4">
                {/* ... (contenuto navigazione) ... */}
            </nav>

            {view !== 'reports' && (
                <div className="bg-gray-50 border-b border-t border-gray-200 p-4 w-full mb-8">
                   {/* ... (contenuto filtro aree) ... */}
                </div>
            )}
            
            <div className="py-2 flex space-x-2 justify-center w-full max-w-7xl mb-8">
               {/* ... (pulsanti report) ... */}
            </div>

            <main className="w-full max-w-7xl">
                {view === 'employees' && <EmployeeManagementView employees={employeesWithStatus} openModal={openModal} />}
                {view === 'areas' && <AreaManagementView workAreas={workAreasWithCounts} openModal={openModal} />}
                {view === 'admins' && <AdminManagementView admins={admins} openModal={openModal} user={user} />}
                {view === 'reports' && <ReportView reports={reports} title={reportTitle} handleDeleteReportData={handleDeleteReportData} />}
            </main>
            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={workAreas} adminsCount={admins.length} allEmployees={employees} auth={auth} />}
        </>
    );
};

export default AdminDashboard;
