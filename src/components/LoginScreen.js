// src/components/LoginScreen.js

import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import CompanyLogo from './CompanyLogo';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            // QUESTO È IL BLOCCO DI CODICE CHE CI SERVE
            console.error("ERRORE DETTAGLIATO DA FIREBASE:", err); // Stampa l'errore completo in console

            switch (err.code) {
                case 'auth/user-not-found':
                    setError('Nessun utente trovato con questa email.');
                    break;
                case 'auth/wrong-password':
                    setError('Password errata. Riprova.');
                    break;
                case 'auth/invalid-credential':
                    setError('Credenziali non valide (email o password errata).');
                    break;
                default:
                    setError(`Errore imprevisto: ${err.code}`);
                    break;
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePasswordReset = async () => {
        if (!email) {
            setError('Inserisci la tua email per il recupero password.');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            alert('Email di recupero inviata! Controlla la tua posta.');
            setError('');
        } catch (err) {
            setError('Impossibile inviare l\'email. Verifica l\'indirizzo.');
        }
    };

    return (
        <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4">
            <div className="w-full max-w-sm">
                <div className="flex justify-center mb-6"><CompanyLogo /></div>
                <div className="bg-white p-8 rounded-lg shadow-xl">
                    <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Accesso</h2>
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                        <div className="text-right">
                            <button type="button" onClick={handlePasswordReset} className="text-sm text-blue-600 hover:underline focus:outline-none">Password dimenticata?</button>
                        </div>
                        {error && <p className="text-sm text-red-600 text-center bg-red-100 p-2 rounded-md">{error}</p>}
                        <div>
                            <button type="submit" disabled={isLoading} className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-400">
                                {isLoading ? 'Accesso in corso...' : 'Accedi'}
                            </button>
                        </div>
                    </form>
                </div>
                 {/* AVVISO DI COPYRIGHT AGGIORNATO */}
                 <p className="text-center text-xs text-gray-500 mt-6">
                     &copy; {new Date().getFullYear()} TCS Italia S.r.l. Tutti i diritti riservati.
                 </p>
            </div>
        </div>
    );
};

export default LoginScreen;