// File: src/js/components/ChangePasswordScreen.js

import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth'; // Importa la funzione per cambiare password
import { auth } from '../firebase'; // Importa l'istanza auth per prendere l'utente corrente

// Potresti importare un logo o stili
// import CompanyLogo from './CompanyLogo';

const ChangePasswordScreen = ({ user, onPasswordChanged }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);

        // Validazione input
        if (newPassword.length < 6) {
            setError('La nuova password deve essere di almeno 6 caratteri.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Le password non coincidono.');
            return;
        }

        setLoading(true);
        try {
            // Ottieni l'utente corrente da auth (più sicuro che usare la prop 'user')
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error("Utente non autenticato correttamente. Riesegui il login.");
            }

            // 1. Cambia la password in Firebase Authentication
            await updatePassword(currentUser, newPassword);
            console.log("Password aggiornata con successo in Firebase Auth.");

            // 2. Notifica il componente App che la password è stata cambiata
            //    Questo permetterà ad App.js di aggiornare il flag in Firestore
            await onPasswordChanged(); // Chiama la funzione passata da App.js

            // Mostra messaggio di successo. App.js gestirà il reindirizzamento.
            setSuccess(true);

        } catch (error) {
            console.error("Errore durante l'aggiornamento della password:", error);
            // Gestisce errori comuni di Firebase Auth
            if (error.code === 'auth/requires-recent-login') {
                setError('Questa operazione richiede un accesso recente. Effettua nuovamente il logout e il login prima di riprovare.');
                // Opzionale: Aggiungere bottone Logout o forzare logout
            } else if (error.code === 'auth/weak-password') {
                setError('La password fornita è troppo debole.');
            } else {
                setError(`Si è verificato un errore: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="max-w-md w-full bg-white shadow-md rounded-lg p-6 sm:p-8">
                {/* <CompanyLogo /> */}
                <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
                    Cambio Password Obbligatorio
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Per motivi di sicurezza, devi impostare una nuova password per il tuo account.
                </p>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                            <span className="block sm:inline">{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
                            <span className="block sm:inline">Password aggiornata con successo! Verrai reindirizzato alla dashboard...</span>
                        </div>
                    )}

                    {/* Mostra il form solo se non c'è stato successo */}
                    {!success && (
                        <>
                            <div>
                                <label htmlFor="new-password" className="block text-sm font-medium leading-6 text-gray-900">
                                    Nuova Password (min. 6 caratteri)
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="new-password"
                                        name="newPassword"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="confirm-password" className="block text-sm font-medium leading-6 text-gray-900">
                                    Conferma Nuova Password
                                </label>
                                <div className="mt-2">
                                    <input
                                        id="confirm-password"
                                        name="confirmPassword"
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        // Aggiunta classe mancante
                                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                                    />
                                </div>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-300"
                                >
                                    {loading ? 'Salvataggio...' : 'Imposta Nuova Password'}
                                </button>
                            </div>
                        </>
                    )}
                     {/* Pulsante Logout opzionale in caso di errore 'requires-recent-login' */}
                     {error && error.includes("accesso recente") && (
                         <div className="mt-4 text-center">
                            <button
                                type="button"
                                onClick={async () => {
                                    // Importa signOut dinamicamente solo se serve
                                    const { signOut } = await import('firebase/auth');
                                    await signOut(auth);
                                }}
                                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
                            >
                                Esegui Logout
                            </button>
                         </div>
                     )}
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordScreen;