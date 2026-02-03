// src/components/LoginScreen.js

import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import CompanyLogo from './CompanyLogo';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error("ERRORE DETTAGLIATO DA FIREBASE:", err); 

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
        setError('');
        setSuccessMessage('');
        
        if (!email) {
            setError('Inserisci la tua email nel campo sopra per il recupero password.');
            return;
        }
        
        try {
            await new Promise(resolve => setTimeout(resolve, 500)); 
            await sendPasswordResetEmail(auth, email);
            
            // Messaggio semplice qui, il dettaglio SPAM è nel render sotto
            setSuccessMessage('Email di recupero inviata!'); 
        } catch (err) {
            setError('Impossibile inviare l\'email. Verifica l\'indirizzo sia corretto.');
        }
    };

    return (
        <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4">
            
            <div className="w-full max-w-md sm:max-w-lg">
                
                <div className="flex flex-col items-center justify-center mb-6 text-center">
                    <CompanyLogo /> 
                    <p className="text-xs text-gray-600 mt-2">Created D Leoncino</p>
                </div>

                <div className="bg-white p-8 rounded-xl shadow-2xl border border-gray-200">
                    <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Accesso Marcatempo</h2>
                    
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                            <input 
                                id="email" 
                                type="email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" 
                                placeholder="nome.cognome@tcsitalia.com"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                            <input 
                                id="password" 
                                type="password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                                className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" 
                                placeholder="Min. 6 caratteri"
                            />
                        </div>
                        
                        <div className="text-right">
                            <button 
                                type="button" 
                                onClick={handlePasswordReset} 
                                className="text-sm text-indigo-600 hover:underline focus:outline-none bg-transparent p-0 disabled:text-gray-400"
                                disabled={isLoading}
                            >
                                ❓Password dimenticata?
                            </button>
                        </div>

                        {/* MESSAGGIO ERRORE */}
                        {error && <p className="text-sm text-red-700 text-center bg-red-100 p-2 rounded-lg font-medium">{error}</p>}
                        
                        {/* MESSAGGIO SUCCESSO CON AVVISO SPAM */}
                        {successMessage && (
                            <div className="text-center bg-green-50 p-3 rounded-lg border border-green-200">
                                <p className="text-sm text-green-700 font-bold mb-1">✅ {successMessage}</p>
                                <p className="text-xs text-green-800 bg-green-100 p-2 rounded border border-green-300 inline-block">
                                    ⚠️ <b>ATTENZIONE:</b> Se non la trovi, controlla la cartella <b>SPAM</b> o <b>Posta Indesiderata</b>!
                                </p>
                            </div>
                        )}

                        <div>
                            <button 
                                type="submit" 
                                disabled={isLoading} 
                                className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'Accesso in corso...' : '👉Accedi'}
                            </button>
                        </div>
                    </form>
                </div>
                 
                 <p className="text-center text-xs text-gray-500 mt-6">
                     &copy; {new Date().getFullYear()} TCS Italia S.r.l. Tutti i diritti riservati.
                 </p>
            </div>
        </div>
    );
};

export default LoginScreen;