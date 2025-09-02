import React from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../firebase';
import CompanyLogo from './CompanyLogo';

const LoginScreen = () => {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');
    const [successMessage, setSuccessMessage] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [view, setView] = React.useState('login'); // 'login', 'reset', 'register'
    const [registerData, setRegisterData] = React.useState({
        name: '',
        surname: '',
        phone: '',
        email: '',
        password: '',
    });

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
        setSuccessMessage('');
        const deviceLock = localStorage.getItem('deviceLock');
        if (deviceLock) {
            const lockData = JSON.parse(deviceLock);
            if (lockData.email !== email) {
                setError('Accesso bloccato. Questo dispositivo è già stato usato da un altro utente. Eseguire il logout prima di cambiare utente.');
                setIsLoading(false);
                return;
            }
        }
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

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        if (!email) {
            setError("Per favore, inserisci la tua email.");
            return;
        }
        setIsLoading(true);
        setError('');
        setSuccessMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMessage(`Email di recupero inviata con successo a ${email}. Controlla la tua casella di posta.`);
        } catch (err) {
            console.error("Password Reset Error:", err);
            setError("Impossibile inviare l'email. Controlla che l'indirizzo sia corretto e riprova.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (registerData.password.length < 6) {
            setError("La password deve essere di almeno 6 caratteri.");
            return;
        }
        setIsLoading(true);
        setError('');
        setSuccessMessage('');
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, registerData.email, registerData.password);
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), {
                email: registerData.email,
                role: 'employee'
            });
            await addDoc(collection(db, "employees"), {
                userId: user.uid,
                name: registerData.name,
                surname: registerData.surname,
                phone: registerData.phone,
                email: registerData.email,
                workAreaIds: [],
                workAreaNames: []
            });
            setSuccessMessage("Registrazione completata! Ora puoi effettuare il login.");
            setView('login');
        } catch (err) {
            console.error("Registration Error:", err);
            if (err.code === 'auth/email-already-in-use') {
                setError("Questa email è già stata registrata.");
            } else {
                setError("Si è verificato un errore durante la registrazione. Riprova.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegisterInputChange = (e) => {
        setRegisterData({ ...registerData, [e.target.name]: e.target.value });
    };

    if (view === 'reset') {
        return (
            <div className="max-w-lg w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
                <div className="flex justify-center"><CompanyLogo /></div>
                <h2 className="text-center text-3xl font-extrabold text-gray-900">Recupera Password</h2>
                <p className="text-center text-sm text-gray-600">Inserisci la tua email per ricevere un link di recupero.</p>
                <form onSubmit={handlePasswordReset} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="La tua Email" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    {successMessage && <p className="text-green-600 text-sm">{successMessage}</p>}
                    <button type="submit" disabled={isLoading} className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md">
                        {isLoading ? 'Invio in corso...' : 'Invia Email di Recupero'}
                    </button>
                </form>
                <div className="text-center">
                    <button onClick={() => { setView('login'); setError(''); setSuccessMessage(''); }} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                        Torna al Login
                    </button>
                </div>
            </div>
        );
    }

    if (view === 'register') {
        return (
             <div className="max-w-lg w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
                <div className="flex justify-center"><CompanyLogo /></div>
                <h2 className="text-center text-3xl font-extrabold text-gray-900">Registra un nuovo account</h2>
                <form onSubmit={handleRegister} className="space-y-4">
                     <input name="name" onChange={handleRegisterInputChange} placeholder="Nome" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                     <input name="surname" onChange={handleRegisterInputChange} placeholder="Cognome" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                     <input name="phone" onChange={handleRegisterInputChange} placeholder="Telefono" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                     <input type="email" name="email" onChange={handleRegisterInputChange} placeholder="Email" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                     <input type="password" name="password" onChange={handleRegisterInputChange} placeholder="Password (min. 6 caratteri)" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                    
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    {successMessage && <p className="text-green-600 text-sm">{successMessage}</p>}

                    <button type="submit" disabled={isLoading} className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md">
                        {isLoading ? 'Registrazione in corso...' : 'Registrati'}
                    </button>
                </form>
                <div className="text-center">
                    <button onClick={() => { setView('login'); setError(''); setSuccessMessage(''); }} className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                        Hai già un account? Accedi
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-lg w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
            <div className="flex justify-center"><CompanyLogo /></div>
            <h2 className="text-center text-3xl font-extrabold text-gray-900">Accedi al tuo account</h2>
            <form onSubmit={handleLogin} className="space-y-6">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
                
                <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={() => { setView('register'); setError(''); setSuccessMessage(''); }} className="font-medium text-indigo-600 hover:text-indigo-500">
                        Non hai un account? Registrati
                    </button>
                    <button type="button" onClick={() => { setView('reset'); setError(''); setSuccessMessage(''); }} className="font-medium text-indigo-600 hover:text-indigo-500">
                        Password dimenticata?
                    </button>
                </div>

                {error && <p className="text-red-500 text-sm whitespace-pre-wrap">{error}</p>}
                {successMessage && <p className="text-green-600 text-sm">{successMessage}</p>}

                <button type="submit" disabled={isLoading} className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-md">
                    {isLoading ? 'Accesso in corso...' : 'Accedi'}
                </button>
            </form>
        </div>
    );
};

export default LoginScreen;