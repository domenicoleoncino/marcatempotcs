import React from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut 
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc,
    onSnapshot,
    deleteDoc,
    writeBatch
} from 'firebase/firestore';

// --- ISTRUZIONI FIREBASE ---
// 1. Crea un progetto su https://firebase.google.com/
// 2. Nelle Impostazioni Progetto, crea una nuova App Web (</>).
// 3. Copia l'oggetto `firebaseConfig` che ti viene fornito.
// 4. Incolla l'oggetto qui sotto, sostituendo quello di esempio.
// 5. In Firebase, vai su Authentication > Metodo di accesso e abilita "Email/Password".
// 6. In Firebase, vai su Firestore Database > Regole e imposta:
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /{document=**} {
//          allow read, write: if request.auth != null;
//        }
//      }
//    }
// --- FINE ISTRUZIONI ---

// INCOLLA LA TUA CONFIGURAZIONE FIREBASE QUI
const firebaseConfig = {
  apiKey: "AIzaSyD9bjpB9LxiixUJsJ_Wq4_dcbn3q9fj-7k",
  authDomain: "marcatempo-tcs.firebaseapp.com",
  projectId: "marcatempo-tcs",
  storageBucket: "marcatempo-tcs.appspot.com",
  messagingSenderId: "385748349249",
  appId: "1:385748349249:web:3e80c0dd1a8266f53f71c0",
  measurementId: "G-04EYMT11Q7"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- FUNZIONI DI UTILITÀ ---

// Formula di Haversine per calcolare la distanza tra due coordinate geografiche
const getDistance = (coords1, coords2) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Raggio della Terra in km

    const dLat = toRad(coords2.latitude - coords1.latitude);
    const dLon = toRad(coords2.longitude - coords1.longitude);
    const lat1 = toRad(coords1.latitude);
    const lat2 = toRad(coords2.latitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // in metri
};


// --- COMPONENTI ---

const CompanyLogo = () => (
    <div className="flex items-center space-x-3">
        <img 
            src="https://i.imgur.com/EJHuOxb.png" 
            alt="Logo Aziendale" 
            className="h-12"
            onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/200x60/cccccc/ffffff?text=Logo'; }}
        />
    </div>
);

const Clock = () => {
    const [time, setTime] = React.useState(new Date());

    React.useEffect(() => {
        const timerId = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    return (
        <div className="text-center bg-gray-100 p-4 rounded-lg shadow-inner">
            <p className="text-5xl md:text-7xl font-mono font-bold text-gray-800">
                {time.toLocaleTimeString('it-IT')}
            </p>
            <p className="text-lg text-gray-500">{time.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
    );
};

const LoginScreen = () => {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
        const loginError = sessionStorage.getItem('loginError');
        if (loginError) {
            setError(loginError);
            sessionStorage.removeItem('loginError');
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error("Login Error:", err);
            if (err.code === 'auth/invalid-credential') {
                setError('Email o password non corretta. Riprova.');
            } else {
                setError('Si è verificato un errore di connessione. Riprova.');
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
                <div className="flex justify-center mb-4">
                    <CompanyLogo />
                </div>
                <h2 className="text-center text-3xl font-extrabold text-gray-900">Accedi al tuo account</h2>
                <form onSubmit={handleLogin} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {error && <p className="text-red-500 text-sm whitespace-pre-wrap">{error}</p>}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
                    >
                        {isLoading ? 'Accesso in corso...' : 'Accedi'}
                    </button>
                </form>
            </div>
        </div>
    );
};

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
    
    React.useEffect(() => {
        const unsubEmployees = onSnapshot(collection(db, "employees"), (snapshot) => {
            setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const unsubAreas = onSnapshot(collection(db, "work_areas"), (snapshot) => {
            setWorkAreas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const qAdmins = query(collection(db, "users"), where("role", "==", "admin"));
        const unsubAdmins = onSnapshot(qAdmins, (snapshot) => {
            setAdmins(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const qEntries = query(collection(db, "time_entries"), where("status", "==", "clocked-in"));
        const unsubEntries = onSnapshot(qEntries, (snapshot) => {
            setActiveEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            unsubEmployees();
            unsubAreas();
            unsubAdmins();
            unsubEntries();
        };
    }, []);

    const openModal = (type, item = null) => {
        setModalType(type);
        setSelectedItem(item);
        setShowModal(true);
    };
    
    const generateReport = async (reportType) => {
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
            default: // Daily
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                startDate = today;
                title = 'Report Giornaliero';
                break;
        }

        setReportTitle(title);
        
        const q = query(collection(db, "time_entries"), where("clockInTime", ">=", startDate));
        const querySnapshot = await getDocs(q);
        const entries = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const reportData = {};

        for (const entry of entries) {
            const employeeDoc = await getDoc(doc(db, "employees", entry.employeeId));
            const areaDoc = await getDoc(doc(db, "work_areas", entry.workAreaId));

            if (employeeDoc.exists() && areaDoc.exists()) {
                const employeeName = `${employeeDoc.data().name} ${employeeDoc.data().surname}`;
                const areaName = areaDoc.data().name;
                const duration = entry.clockOutTime ? (entry.clockOutTime.toDate() - entry.clockInTime.toDate()) / 3600000 : 0;

                if (!reportData[employeeName]) {
                    reportData[employeeName] = {};
                }
                if (!reportData[employeeName][areaName]) {
                    reportData[employeeName][areaName] = 0;
                }
                reportData[employeeName][areaName] += duration;
            }
        }
        setReports(reportData);
        setView('reports');
    };

    const employeesWithStatus = employees.map(emp => {
        const activeEntry = activeEntries.find(entry => entry.employeeId === emp.id);
        return { ...emp, activeEntry };
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
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-center flex-wrap space-x-4">
                        <button onClick={() => setView('employees')} className={`py-4 px-1 border-b-2 font-medium text-sm ${view === 'employees' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Dipendenti</button>
                        <button onClick={() => setView('areas')} className={`py-4 px-1 border-b-2 font-medium text-sm ${view === 'areas' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Aree di Lavoro</button>
                        <button onClick={() => setView('admins')} className={`py-4 px-1 border-b-2 font-medium text-sm ${view === 'admins' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Amministratori</button>
                        <div className="py-2 flex space-x-2">
                           <button onClick={() => generateReport('daily')} className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Report Giornaliero</button>
                           <button onClick={() => generateReport('weekly')} className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Report Settimanale</button>
                           <button onClick={() => generateReport('monthly')} className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300">Report Mensile</button>
                        </div>
                    </div>
                </div>
            </nav>
            <main className="p-8">
                {view === 'employees' && <EmployeeManagementView employees={employeesWithStatus} openModal={openModal} />}
                {view === 'areas' && <AreaManagementView workAreas={workAreas} openModal={openModal} />}
                {view === 'admins' && <AdminManagementView admins={admins} openModal={openModal} user={user} />}
                {view === 'reports' && <ReportView reports={reports} title={reportTitle} />}
            </main>
            {showModal && <AdminModal type={modalType} item={selectedItem} setShowModal={setShowModal} workAreas={workAreas} adminsCount={admins.length} allEmployees={employees} />}
        </div>
    );
};

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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latitudine</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Longitudine</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raggio (m)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {workAreas.map(area => (
                        <tr key={area.id}>
                            <td className="px-6 py-4 whitespace-nowrap">{area.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{area.latitude}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{area.longitude}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{area.radius}</td>
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

const ReportView = ({ reports, title }) => (
    <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-6">{title || 'Report'}</h1>
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            {Object.keys(reports).length === 0 ? (
                <p className="p-6 text-gray-500">Nessun dato di timbratura per il periodo selezionato.</p>
            ) : (
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Area di Lavoro</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ore Lavorate</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {Object.entries(reports).map(([employeeName, areaData]) => 
                            Object.entries(areaData).map(([areaName, hours]) => (
                                <tr key={`${employeeName}-${areaName}`}>
                                    <td className="px-6 py-4 whitespace-nowrap">{employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{areaName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{hours.toFixed(2)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            )}
        </div>
    </div>
);

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

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    
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
        setIsLoading(true);
        setError('');

        try {
            switch (type) {
                case 'newEmployee':
                    const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", userCred.user.uid), { email: formData.email, role: 'employee' });
                    await addDoc(collection(db, "employees"), {
                        userId: userCred.user.uid, name: formData.name, surname: formData.surname,
                        phone: formData.phone, email: formData.email, workAreaIds: [], workAreaNames: []
                    });
                    break;
                case 'editEmployee':
                    await updateDoc(doc(db, "employees", item.id), {
                        name: formData.name, surname: formData.surname, phone: formData.phone
                    });
                    break;
                case 'deleteEmployee':
                    await deleteDoc(doc(db, "employees", item.id));
                    await deleteDoc(doc(db, "users", item.userId));
                    break;
                case 'newArea':
                    await addDoc(collection(db, "work_areas"), {
                        name: formData.name, latitude: parseFloat(formData.latitude),
                        longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10)
                    });
                    break;
                case 'editArea':
                    await updateDoc(doc(db, "work_areas", item.id), {
                        name: formData.name, latitude: parseFloat(formData.latitude),
                        longitude: parseFloat(formData.longitude), radius: parseInt(formData.radius, 10)
                    });
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
                    await updateDoc(doc(db, "employees", item.id), {
                        workAreaIds: formData.workAreaIds || [], workAreaNames: selectedAreaNames
                    });
                    break;
                case 'newAdmin':
                    if (adminsCount >= 10) throw new Error("Limite massimo di 10 amministratori raggiunto.");
                    const adminCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
                    await setDoc(doc(db, "users", adminCred.user.uid), { email: formData.email, role: 'admin' });
                    break;
                case 'deleteAdmin':
                    if (item.id === auth.currentUser.uid) {
                        throw new Error("Non puoi eliminare te stesso.");
                    }
                    await deleteDoc(doc(db, "users", item.id));
                    break;
                case 'manualClockIn':
                    await addDoc(collection(db, "time_entries"), {
                        employeeId: item.id,
                        workAreaId: formData.workAreaId,
                        clockInTime: new Date(formData.timestamp),
                        clockOutTime: null,
                        status: 'clocked-in'
                    });
                    break;
                case 'manualClockOut':
                    await updateDoc(doc(db, "time_entries", item.activeEntry.id), {
                        clockOutTime: new Date(formData.timestamp),
                        status: 'clocked-out'
                    });
                    break;
                default:
                    break;
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
                            <input type="email" name="email" onChange={handleInputChange} placeholder="Email" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                            <input type="password" name="password" onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
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
                        <input type="email" name="email" onChange={handleInputChange} placeholder="Email" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
                        <input type="password" name="password" onChange={handleInputChange} placeholder="Password (min. 6 caratteri)" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md" required />
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
                <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                    <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                </div>
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <form onSubmit={handleSubmit}>
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            {renderForm()}
                            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                            <button type="submit" disabled={isLoading} className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none sm:ml-3 sm:w-auto sm:text-sm ${isDeleteAction ? 'bg-red-600 hover:bg-red-700 disabled:bg-red-300' : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300'}`}>
                                {isLoading ? 'In corso...' : (isDeleteAction ? 'Elimina' : 'Salva')}
                            </button>
                            <button type="button" onClick={() => setShowModal(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm">
                                Annulla
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};


const EmployeeDashboard = ({ user, handleLogout }) => {
    const [employeeData, setEmployeeData] = React.useState(null);
    const [workAreas, setWorkAreas] = React.useState([]);
    const [currentPosition, setCurrentPosition] = React.useState(null);
    const [locationError, setLocationError] = React.useState('');
    const [status, setStatus] = React.useState({ clockedIn: false, area: null, entryId: null });
    const [canClockIn, setCanClockIn] = React.useState(false);
    const [clockingInProgress, setClockingInProgress] = React.useState(false);
    
    React.useEffect(() => {
        const q = query(collection(db, "employees"), where("userId", "==", user.uid));
        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            if (!querySnapshot.empty) {
                const empDoc = querySnapshot.docs[0];
                const empData = { id: empDoc.id, ...empDoc.data() };
                setEmployeeData(empData);

                if (empData.workAreaIds && empData.workAreaIds.length > 0) {
                    const areasQuery = query(collection(db, "work_areas"), where("__name__", "in", empData.workAreaIds));
                    const areasSnapshot = await getDocs(areasQuery);
                    setWorkAreas(areasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                } else {
                    setWorkAreas([]);
                }
            }
        });
        return () => unsubscribe();
    }, [user.uid]);

    React.useEffect(() => {
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setCurrentPosition(pos.coords);
                setLocationError('');
            },
            (err) => {
                setLocationError('Impossibile ottenere la posizione. Assicurati di aver concesso i permessi.');
                console.error(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    
    React.useEffect(() => {
        if (!employeeData) return;
        const q = query(collection(db, "time_entries"), 
            where("employeeId", "==", employeeData.id),
            where("status", "==", "clocked-in")
        );
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (!snapshot.empty) {
                const entryDoc = snapshot.docs[0];
                const entryData = entryDoc.data();
                const areaDoc = await getDoc(doc(db, "work_areas", entryData.workAreaId));
                setStatus({ clockedIn: true, area: areaDoc.data()?.name || 'Sconosciuta', entryId: entryDoc.id });
            } else {
                setStatus({ clockedIn: false, area: null, entryId: null });
            }
        });
        return () => unsubscribe();
    }, [employeeData]);

    React.useEffect(() => {
        if (currentPosition && workAreas.length > 0) {
            const isInsideAnyArea = workAreas.some(area => {
                const distance = getDistance(currentPosition, area);
                return distance <= area.radius;
            });
            setCanClockIn(isInsideAnyArea);
        } else {
            setCanClockIn(false);
        }
    }, [currentPosition, workAreas]);

    const handleClockIn = async () => {
        if (!canClockIn || !currentPosition) return;
        setClockingInProgress(true);
        
        let areaToClockIn = null;
        for (const area of workAreas) {
            const distance = getDistance(currentPosition, area);
            if (distance <= area.radius) {
                areaToClockIn = area;
                break;
            }
        }

        if (areaToClockIn) {
            try {
                await addDoc(collection(db, "time_entries"), {
                    employeeId: employeeData.id,
                    workAreaId: areaToClockIn.id,
                    clockInTime: new Date(),
                    clockOutTime: null,
                    status: 'clocked-in'
                });
            } catch (err) {
                console.error("Error clocking in: ", err);
            }
        }
        setClockingInProgress(false);
    };

    const handleClockOut = async () => {
        if (!status.entryId) return;
        setClockingInProgress(true);
        try {
            const entryRef = doc(db, "time_entries", status.entryId);
            await updateDoc(entryRef, {
                clockOutTime: new Date(),
                status: 'clocked-out'
            });
        } catch (err) {
            console.error("Error clocking out: ", err);
        }
        setClockingInProgress(false);
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md p-4 flex justify-between items-center">
                <CompanyLogo />
                <div className="flex items-center space-x-4">
                    <span className="text-gray-600 hidden sm:block">Dipendente: {user.email}</span>
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
                </div>
            </header>
            <main className="p-4 md:p-8 max-w-4xl mx-auto space-y-8">
                <Clock />

                <div className="bg-white p-6 rounded-xl shadow-lg text-center space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800">Stato Timbratura</h2>
                    {status.clockedIn ? (
                        <div className="p-4 bg-green-100 border-l-4 border-green-500 text-green-700 rounded-lg">
                            <p className="font-bold">Timbratura ATTIVA</p>
                            <p>Area: {status.area}</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-lg">
                            <p className="font-bold">Timbratura NON ATTIVA</p>
                        </div>
                    )}

                    {status.clockedIn ? (
                        <button 
                            onClick={handleClockOut}
                            disabled={clockingInProgress}
                            className="w-full md:w-1/2 py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xl rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:bg-red-300"
                        >
                            {clockingInProgress ? '...' : 'TIMBRA USCITA'}
                        </button>
                    ) : (
                        <button 
                            onClick={handleClockIn}
                            disabled={!canClockIn || clockingInProgress}
                            className="w-full md:w-1/2 py-4 px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                             {clockingInProgress ? '...' : 'TIMBRA ENTRATA'}
                        </button>
                    )}
                    
                    {!status.clockedIn && !canClockIn && (
                        <p className="text-red-500 mt-2 text-sm">
                            {locationError ? locationError : "Non sei in un'area di lavoro autorizzata per la timbratura."}
                        </p>
                    )}
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Le tue Aree di Lavoro</h3>
                    {workAreas.length > 0 ? (
                        <ul className="list-disc list-inside space-y-2 text-gray-700">
                            {workAreas.map(area => <li key={area.id}>{area.name}</li>)}
                        </ul>
                    ) : (
                        <p className="text-gray-500">Nessuna area di lavoro assegnata.</p>
                    )}
                </div>
            </main>
        </div>
    );
};


export default function App() {
    const [user, setUser] = React.useState(null);
    const [userRole, setUserRole] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser) {
                    const userDocRef = doc(db, "users", firebaseUser.uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        setUser(firebaseUser);
                        setUserRole(userDoc.data().role);
                    } else {
                        console.error("Documento utente non trovato in Firestore per UID:", firebaseUser.uid);
                        const detailedError = `ERRORE: L'utente ${firebaseUser.email} non ha un ruolo nel DB.\n\nPer creare il primo admin:\n1) Vai su Firebase > Firestore.\n2) Nella collezione 'users', clicca 'Aggiungi documento'.\n3) Usa questo UID come ID: ${firebaseUser.uid}\n4) Aggiungi i campi 'role' ("admin") e 'email' ("${firebaseUser.email}").\n5) Salva e riprova.`;
                        sessionStorage.setItem('loginError', detailedError);
                        await signOut(auth);
                        setUser(null);
                        setUserRole(null);
                    }
                } else {
                    setUser(null);
                    setUserRole(null);
                }
            } catch (error) {
                console.error("Errore durante il controllo dello stato di autenticazione:", error);
                let errorMessage = 'Errore di rete o di configurazione. Riprova.';
                if (error.code === 'permission-denied' || (error.message && error.message.includes('Missing or insufficient permissions'))) {
                    errorMessage = "ERRORE DI PERMESSI: L'app non ha il permesso di leggere i dati dal database. Controlla le tue Regole di Sicurezza in Firebase > Firestore Database > Regole. Assicurati che permettano la lettura agli utenti autenticati (allow read: if request.auth != null;).";
                }
                sessionStorage.setItem('loginError', errorMessage);
                // Non fare il signOut qui, per permettere all'utente di vedere l'errore
                setUser(null);
                setUserRole(null);
            } finally {
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-xl font-semibold">Caricamento in corso...</p>
            </div>
        );
    }

    if (!user) {
        return <LoginScreen />;
    }

    if (userRole === 'admin') {
        return <AdminDashboard user={user} handleLogout={handleLogout} />;
    }

    if (userRole === 'employee') {
        return <EmployeeDashboard user={user} handleLogout={handleLogout} />;
    }
    
    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            <p className="text-xl font-semibold">Ruolo utente non definito.</p>
            <button onClick={handleLogout} className="mt-4 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Logout</button>
        </div>
    );
}
