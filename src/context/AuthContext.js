// File: src/context/AuthContext.js (REVISED & CENTRALIZED)

import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, collection, getDocs, query, where, onSnapshot } from 'firebase/firestore'; // Rimosso getDoc non necessario

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null); // User from Firebase Auth
    const [userData, setUserData] = useState(null);     // Merged data from Firestore (/users + /employees if applicable)
    const [loading, setLoading] = useState(true);      // Initial loading state

    useEffect(() => {
        let unsubscribeFirestore = () => {}; // To clean up the /users listener

        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            console.log("AuthContext: Auth state changed. User:", user ? user.uid : 'null');
            setCurrentUser(user);
            setUserData(null); // Reset user data on auth change
            unsubscribeFirestore(); // Clean up previous listener

            if (user) {
                setLoading(true); // Start loading user data

                // Force token refresh (optional but good practice)
                try { await user.getIdToken(true); }
                catch (tokenError) { console.error("AuthContext: Error refreshing token:", tokenError); }

                const userDocRef = doc(db, 'users', user.uid);

                // Listen to the /users document in real-time
                unsubscribeFirestore = onSnapshot(userDocRef, async (userDocSnap) => {
                    console.log("AuthContext: onSnapshot for /users fired.");

                    if (userDocSnap.exists()) {
                        const baseProfile = { id: userDocSnap.id, ...userDocSnap.data() }; // Include user doc ID as main ID
                        console.log("AuthContext: Base profile from /users:", JSON.stringify(baseProfile, null, 2));

                        // Decide if we need to merge with /employees data
                        if (baseProfile.role === 'dipendente' || baseProfile.role === 'preposto') {
                            console.log("AuthContext: Role requires merging with /employees.");
                            try {
                                const q = query(collection(db, 'employees'), where("userId", "==", user.uid));
                                // Usiamo getDocs qui perché il profilo employee cambia raramente
                                const employeeQuerySnapshot = await getDocs(q);

                                if (!employeeQuerySnapshot.empty) {
                                    const employeeDoc = employeeQuerySnapshot.docs[0];
                                    const employeeData = employeeDoc.data();
                                    // Merge: Data from /users (baseProfile, real-time) takes precedence
                                    const fullProfile = { ...employeeData, ...baseProfile /* id è già quello di baseProfile */ };
                                    console.log("AuthContext: Merged profile:", JSON.stringify(fullProfile, null, 2));
                                    setUserData(fullProfile);
                                } else {
                                    console.error(`AuthContext: ERRORE - Profilo 'employees' non trovato per ${baseProfile.role} UID: ${user.uid}`);
                                    setUserData({ ...baseProfile, role: 'dati_corrotti' }); // Segnala dati corrotti
                                }
                            } catch (employeeError) {
                                console.error("AuthContext: Errore fetching employee profile:", employeeError);
                                setUserData({ ...baseProfile, role: 'errore_db_employee' });
                            }
                        } else if (baseProfile.role === 'admin') {
                            console.log("AuthContext: Role is Admin, using base profile.");
                            setUserData(baseProfile); // Admin uses only /users data
                        } else {
                            console.error(`AuthContext: ERRORE - Ruolo non riconosciuto: ${baseProfile.role}`);
                            setUserData({ ...baseProfile, role: 'ruolo_sconosciuto' });
                        }
                    } else {
                        console.error(`AuthContext: ERRORE - Documento utente non trovato in /users per UID: ${user.uid}`);
                        // Forniamo un oggetto minimo per evitare errori, indicando lo stato
                        setUserData({ role: 'utente_sconosciuto_db', id: user.uid, email: user.email });
                    }
                    // Data loading is complete (or failed) after attempt
                    // Impostalo a false qui, dopo che setUserData ha avuto la possibilità di aggiornare
                    setLoading(false);
                    console.log("AuthContext: User data processing complete. Loading set to false.");

                }, (error) => {
                    console.error("AuthContext: Errore listener Firestore (/users):", error);
                    setUserData({ role: 'errore_db', id: user.uid, email: user.email });
                    setLoading(false);
                });

            } else {
                // User logged out
                setCurrentUser(null); // Assicurati currentUser sia null
                setUserData(null);
                setLoading(false); // No user, loading finished
                console.log("AuthContext: User logged out. Loading set to false.");
            }
        });

        // Cleanup auth listener on component unmount
        return () => {
            console.log("AuthContext: Cleaning up Auth and Firestore listeners.");
            unsubscribeAuth();
            unsubscribeFirestore();
        };
    }, []); // Run only once on mount

    const value = {
        currentUser,
        userData, // The merged user data provided by the context
        loading
    };

    // Render children only when loading is complete? O mostrare uno spinner globale?
    // Per ora rendiamo sempre i figli, AppContent gestirà lo stato di loading.
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook personalizzato (opzionale ma comodo)
export const useAuth = () => {
    return useContext(AuthContext);
};