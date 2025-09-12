import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import CompanyLogo from './CompanyLogo';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Il reindirizzamento verrà gestito dal listener onAuthStateChanged nell'App principale
        } catch (err) {
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                setError('Email o password non corretta. Riprova.');
            } else {
                setError('Si è verificato un errore di connessione.');
            }
            setIsLoading(false);
        }
    };

    const handleRegister = () => {
        navigate('/register');
    };

    return (
        // CONTENITORE PRINCIPALE CHE CENTRA TUTTO
        <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 p-4">
            
            {/* CARD BIANCA CHE CONTIENE IL FORM */}
            <div className="w-full max-w-sm bg-white p-8 rounded-lg shadow-md">

                <div className="mb-6 text-center">
                    <CompanyLogo />
                    <h2 className="mt-4 text-2xl font-bold text-gray-800">Accesso</h2>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="iltuo@indirizzo.email"
                            required
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-300"
                        >
                            {isLoading ? 'Accesso in corso...' : 'Accedi'}
                        </button>
                    </div>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={handleRegister} className="text-sm text-blue-600 hover:underline">
                        Non hai un account? Registrati
                    </button>
                </div>

            </div>
        </div>
    );
};

export default Login;